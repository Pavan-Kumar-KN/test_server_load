"use strict";

import { 
    getSession, 
    getChatList, 
    isExists, 
    sendMessage, 
    formatGroup } from './../whatsapp.js'
import response from './../response.js'

const getList = (req, res) => {
    return response(res, 200, true, '', getChatList(res.locals.sessionId, true))
}

const getAllGroups = async (req, res) => {
    const session = getSession(res.locals.sessionId)

    try {
        // This returns all groups where the user is participating
        const groups = await session.groupFetchAllParticipating()
        
        // Transform the groups object into a more friendly format
        const groupsList = Object.values(groups).map(group => ({
            id: group.id,
            subject: group.subject,
            description: group.desc,
            participants: group.participants.map(p => ({
                id: p.id,
                admin: p.admin,
                isSuperAdmin: p.isSuperAdmin
            })),
            creation: group.creation,
            owner: group.owner,
            restrict: group.restrict,
            announce: group.announce,
            memberCount: group.participants.length
        }))

        response(res, 200, true, 'All group fetched successfully',  groupsList)
    } catch (error) {
        response(res, 500, false, 'Failed to fetch groups list')
    }
}

const getGroupMetaData = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params

    try {
        const data = await session.groupMetadata(jid)

        if (!data.id) {
            return response(res, 400, false, 'The group is not exists.')
        }

        response(res, 200, true, '', data)
    } catch {
        response(res, 500, false, 'Failed to get group metadata.')
    }
}

const send = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const receiver = formatGroup(req.body.receiver)
    const { message } = req.body

    try {
        const exists = await isExists(session, receiver, true)

        if (!exists) {
            return response(res, 400, false, 'The group is not exists.')
        }

        await sendMessage(session, receiver, message)

        response(res, 200, true, 'The message has been successfully sent.')
    } catch {
        response(res, 500, false, 'Failed to send the message.')
    }
}

const createGroup = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { subject, participants } = req.body

    try {
        const group = await session.groupCreate(subject, participants)
        response(res, 200, true, 'Group created successfully', group)
    } catch (error) {
        response(res, 500, false, 'Failed to create group')
    }
}

const updateGroupSubject = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params
    const { subject } = req.body

    try {
        await session.groupUpdateSubject(jid, subject)
        response(res, 200, true, 'Group subject updated successfully')
    } catch (error) {
        response(res, 500, false, 'Failed to update group subject')
    }
}

const updateGroupDescription = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params
    const { description } = req.body

    try {
        await session.groupUpdateDescription(jid, description)
        response(res, 200, true, 'Group description updated successfully')
    } catch (error) {
        response(res, 500, false, 'Failed to update group description')
    }
}

const addParticipants = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params
    const { participants } = req.body

    try {
        const result = await session.groupParticipantsUpdate(
            jid,
            participants,
            'add'
        )
        response(res, 200, true, 'Participants added successfully', result)
    } catch (error) {
        response(res, 500, false, 'Failed to add participants')
    }
}

const removeParticipants = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params
    const { participants } = req.body

    try {
        const result = await session.groupParticipantsUpdate(
            jid,
            participants,
            'remove'
        )
        response(res, 200, true, 'Participants removed successfully', result)
    } catch (error) {
        response(res, 500, false, 'Failed to remove participants')
    }
}

const getInviteLink = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params

    try {
        const code = await session.groupInviteCode(jid)
        response(res, 200, true, '', { inviteLink: "https://chat.whatsapp.com/"+code })
    } catch (error) {
        response(res, 500, false, 'Failed to get invite link')
    }
}

const revokeInviteLink = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params

    try {
        const newCode = await session.groupRevokeInvite(jid)
        response(res, 200, true, 'Invite link revoked successfully', { newInviteLink: "https://chat.whatsapp.com/"+newCode })
    } catch (error) {
        response(res, 500, false, 'Failed to revoke invite link')
    }
}

const deleteGroup = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params

    try {
        // First verify if it's a valid group
        const metadata = await session.groupMetadata(jid)
        
        if (!metadata.id) {
            return response(res, 400, false, 'The group does not exist')
        }

        // Leave/delete the group
        await session.groupLeave(jid)
        response(res, 200, true, 'Successfully left/deleted the group')
    } catch (error) {
        response(res, 500, false, 'Failed to leave/delete the group')
    }
}

export { 
       getList,
       getAllGroups,
       getGroupMetaData,
       send,
       createGroup, 
       updateGroupSubject, 
       updateGroupDescription, 
       addParticipants, 
       removeParticipants, 
       getInviteLink, 
       revokeInviteLink,
       deleteGroup
    }
