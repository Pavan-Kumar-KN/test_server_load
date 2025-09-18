import { rmSync, readdir } from 'fs'
import { join } from 'path'
import pino from 'pino'
import makeWASocket, {
    useMultiFileAuthState,
    // makeInMemoryStore,
    Browsers,
    DisconnectReason,
    delay,
} from '@adiwajshing/baileys'
import { toDataURL } from 'qrcode'
import __dirname from './dirname.js'
import response from './response.js'
import axios from 'axios';


const sessions = new Map();

// * help us to track which socket has to be closed
const sessionTimers = new Map();

const retries = new Map()
const reconnectTimeouts = new Map()


/* --- CLEANUP SESSION --- */
function cleanupSession(sessionId) {
    console.log(`🧹 Starting cleanup for session ${sessionId}`);

    // Clear reconnection timeout if exists
    if (reconnectTimeouts.has(sessionId)) {
        clearTimeout(reconnectTimeouts.get(sessionId));
        reconnectTimeouts.delete(sessionId);
        console.log(`⏰ Cleared reconnection timeout for ${sessionId}`);
    }

    // Close the session
    if (sessions.has(sessionId)) {
        try {
            const session = sessions.get(sessionId);
            session.end?.(); // gracefully close
        } catch (e) {
            console.error(`❌ Error closing session ${sessionId}:`, e);
        }
        sessions.delete(sessionId);
        console.log(`🗑️ Session ${sessionId} removed from memory`);
    }

    // Clear session timer
    if (sessionTimers.has(sessionId)) {
        clearTimeout(sessionTimers.get(sessionId));
        sessionTimers.delete(sessionId);
        console.log(`⏲️ Session timer cleared for ${sessionId}`);
    }

    // Clear retry count
    retries.delete(sessionId);
}

const sessionsDir = (sessionId = '') => {
    return join(__dirname, 'sessions', sessionId ? sessionId : '')
}

const isSessionExists = (sessionId) => {
    const result = sessions.has(sessionId);
    return result;
}

const shouldReconnect = (sessionId) => {
    let maxRetries = parseInt(process.env.MAX_RETRIES ?? 0)
    let attempts = retries.get(sessionId) ?? 0

    maxRetries = maxRetries < 1 ? 1 : maxRetries
    
    if (attempts < maxRetries) {
        ++attempts

        console.log('Reconnecting...', { attempts, sessionId })
        retries.set(sessionId, attempts)

        return true
    }

    return false
}

const createSession = async (sessionId, isLegacy = false, res = null) => {
    const sessionFile = (isLegacy ? 'legacy_' : 'md_') + sessionId + (isLegacy ? '.json' : '')

    const logger = pino({ level: 'warn' })
    // const store = makeInMemoryStore({ logger })

    let state, saveState

    if (isLegacy) {

    } else {
        ({ state, saveCreds: saveState } = await useMultiFileAuthState(sessionsDir(sessionFile)))
    }

    /**
     * @type {import('@adiwajshing/baileys').CommonSocketConfig}
     */
    const waConfig = {
        auth: state,
        version: [2, 3000, 1015901307],
        printQRInTerminal: false,
        logger,
        browser: Browsers.ubuntu('Chrome'),
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }

            return message;
        },
    }

    /**
     * @type {import('@adiwajshing/baileys').AnyWASocket}
     */
    const wa = makeWASocket.default(waConfig);

    if (!isLegacy) {
        try {
            // store.readFromFile(sessionsDir(`${sessionId}_store.json`))
            // store.bind(wa.ev)


        } catch (err) {
            console.error(`⚠️ Failed to read store for ${sessionId}, resetting...`, err)
            // optionally delete the corrupted file so it can regenerate
            rmSync(sessionsDir(`${sessionId}_store.json`), { force: true })
        }
    }

    // * V1
    // sessions.set(sessionId, { ...wa, store, isLegacy })

    // * V2

    sessions.set(sessionId, { ...wa, isLegacy })

    wa.ev.on('creds.update', saveState)


    // wa.ev.on('chats.set', ({ chats }) => {
    //     if (isLegacy) {
    //         store.chats.insertIfAbsent(...chats)
    //     }
    // })

    // Automatically read incoming messages, uncomment below codes to enable this behaviour

    wa.ev.on('messages.upsert', async (messages) => {
        try {
            const message = messages.messages[0];

            if (message.key.fromMe == false && messages.type == 'notify') {
                const received_data = [];

                let parseId = message.key.remoteJid.split("@");
                let splitId = parseId[1] ?? null;

                let isGroup = splitId == 's.whatsapp.net' ? false : true;


                if (message != '' && isGroup == false) {
                    axios.post(process.env.WEBHOOK_URL, {
                        remote_id: message.key.remoteJid,
                        secret: process.env.WEBHOOK_SECRET,
                        from: message.key.remoteJid,
                        sessionId: sessionId,
                        message_id: message.key.id,
                        message: message.message,
                        timestamp: message.messageTimestamp,
                        type: message.message?.conversation ? 'text' : message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ? 'quoted' : 'unknown',
                        quoted: message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ? message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation : null,
                    })
                        .then(response => console.log(response.status))
                        .catch(error => console.error(error));
                }

            }
        }
        catch {
            console.error(`❌ Failed to create session ${sessionId}`, err)
            deleteSession(sessionId)
            return
        }
    });

    wa.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        const statusCode = lastDisconnect?.error?.output?.statusCode

        if (connection === 'open') {
            retries.delete(sessionId);

            resetCleanupTimer(sessionId);
        }

        if (connection === 'close') {
            if (statusCode === DisconnectReason.loggedOut || !shouldReconnect(sessionId)) {
                if (res && !res.headersSent) {
                    response(res, 500, false, 'Unable to create session.')
                }

                return deleteSession(sessionId, isLegacy)
            }

            setTimeout(
                () => {
                    createSession(sessionId, isLegacy, res)
                },
                statusCode === DisconnectReason.restartRequired ? 0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0)
            )
        }

        if (update.qr) {
            if (res && !res.headersSent) {
                try {
                    const qr = await toDataURL(update.qr)

                    response(res, 200, true, 'QR code received, please scan the QR code.', { qr })

                    return
                } catch {
                    response(res, 500, false, 'Unable to create QR code.')
                }
            }

            try {
                await wa.logout()
            } catch {
            } finally {
                deleteSession(sessionId, isLegacy);
            }
        }


    })
}


// Helper function to reset cleanup timer
const resetCleanupTimer = (sessionId) => {
    // Clear existing timer
    if (sessionTimers.has(sessionId)) {
        clearTimeout(sessionTimers.get(sessionId));
    }

    // Set new timer for 2 minutes
    const timerId = setTimeout(() => {
        console.log(`⏰ Session ${sessionId} inactive for 2 minutes, cleaning up`);
        cleanupSession(sessionId);
    }, 20000); // 2 minutes 2 * 60 * 1000)

    sessionTimers.set(sessionId, timerId);
}

/**
 * @returns {(import('@adiwajshing/baileys').AnyWASocket|null)}
 */
const getSession = async (sessionId) => {

    if (!sessions.has(sessionId)) {
        console.log(`Rehydrating ${sessionId} from saved creds...`)
        const newSession = await createSession(sessionId);  // Await the session creation
        sessions.set(sessionId, newSession);
    }

    // Reset cleanup timer
    resetCleanupTimer(sessionId);

    return sessions.get(sessionId);
}


const deleteSession = (sessionId, isLegacy = false) => {
    const sessionFile = (isLegacy ? 'legacy_' : 'md_') + sessionId + (isLegacy ? '.json' : '')
    const storeFile = `${sessionId}_store.json`
    const rmOptions = { force: true, recursive: true }

    rmSync(sessionsDir(sessionFile), rmOptions)
    rmSync(sessionsDir(storeFile), rmOptions)

    sessions.delete(sessionId)
    retries.delete(sessionId)

    cleanupSession(sessionId)
    // setDeviceStatus(sessionId, 0);
}

const getChatList = async (sessionId, isGroup = false) => {
    const filter = isGroup ? '@g.us' : '@s.whatsapp.net'

    const session = getSession(sessionId);
    let data;

    if (isGroup) {
        data = Object.values(await session.groupFetchAllParticipating());
        return data;
    }


    data = Object.values(await session.fetchChats());

    return data;

    // * V!
    // return getSession(sessionId).store.chats.filter((chat) => {
    //     return chat.id.endsWith(filter)
    // })
}

/**
 * @param {import('@adiwajshing/baileys').AnyWASocket} session
 */
const isExists = async (session, jid, isGroup = false) => {
    try {
        let result

        if (isGroup) {
            result = await session.groupMetadata(jid)

            return Boolean(result.id)
        }

        if (session.isLegacy) {
            result = await session.onWhatsApp(jid)
        } else {
            ;[result] = await session.onWhatsApp(jid)
        }

        return result.exists
    } catch {
        return false
    }
}

/**
 * @param {import('@adiwajshing/baileys').AnyWASocket} session
 */
const sendMessage = async (session, receiver, message, delayMs = 1000) => {
    try {
        await delay(parseInt(delayMs))


        return session.sendMessage(receiver, message)
    } catch {
        return Promise.reject(null) // eslint-disable-line prefer-promise-reject-errors
    }
}

const formatPhone = (phone) => {
    phone = String(phone)
    if (phone.endsWith('@s.whatsapp.net')) {
        return phone
    }

    let formatted = phone.replace(/\D/g, '')

    return (formatted += '@s.whatsapp.net')
}

const formatGroup = (group) => {
    group = String(group)
    if (group.endsWith('@g.us')) {
        return group
    }

    let formatted = group.replace(/[^\d-]/g, '')

    return (formatted += '@g.us')
}

const cleanup = () => {
    console.log('Running cleanup before exit.')

    // sessions.forEach((session, sessionId) => {
    //     if (!session.isLegacy) {
    //         session.store.writeToFile(sessionsDir(`${sessionId}_store.json`))
    //     }
    // })
}

const init = () => {
    readdir(sessionsDir(), (err, files) => {
        if (err) {
            throw err
        }

        for (const file of files) {
            if ((!file.startsWith('md_') && !file.startsWith('legacy_')) || file.endsWith('_store')) {
                continue
            }

            const filename = file.replace('.json', '')
            const isLegacy = filename.split('_', 1)[0] !== 'md'
            const sessionId = filename.substring(isLegacy ? 7 : 3)

            createSession(sessionId, isLegacy)
        }
    })
}

export {
    isSessionExists,
    createSession,
    getSession,
    deleteSession,
    getChatList,
    isExists,
    sendMessage,
    formatPhone,
    formatGroup,
    cleanup,
    init
}
