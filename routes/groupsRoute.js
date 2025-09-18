import { Router } from 'express'
import { body, query } from 'express-validator'
import requestValidator from './../middlewares/requestValidator.js'
import sessionValidator from './../middlewares/sessionValidator.js'
import * as controller from './../controllers/groupsController.js'
import getMessages from './../controllers/getMessages.js'

const router = Router()

router.get('/', query('id').notEmpty(), requestValidator, sessionValidator, controller.getList)

router.get('/list',
    query('id').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.getAllGroups
)

router.get('/:jid', query('id').notEmpty(), requestValidator, sessionValidator, getMessages)

router.get('/meta/:jid', query('id').notEmpty(), requestValidator, sessionValidator, controller.getGroupMetaData)

router.post(
    '/send',
    query('id').notEmpty(),
    body('receiver').notEmpty(),
    body('message').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.send
)

// Create new group
router.post('/create',
    query('id').notEmpty(),
    body('subject').notEmpty(),
    body('participants').isArray(),
    requestValidator,
    sessionValidator,
    controller.createGroup
)

// Update group subject
router.put('/:jid/subject',
    query('id').notEmpty(),
    body('subject').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.updateGroupSubject
)

// Update group description
router.put('/:jid/description',
    query('id').notEmpty(),
    body('description').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.updateGroupDescription
)

// Add participants
router.post('/:jid/participants',
    query('id').notEmpty(),
    body('participants').isArray(),
    requestValidator,
    sessionValidator,
    controller.addParticipants
)

// Remove participants
router.delete('/:jid/participants',
    query('id').notEmpty(),
    body('participants').isArray(),
    requestValidator,
    sessionValidator,
    controller.removeParticipants
)

// Get invite link
router.get('/:jid/invite',
    query('id').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.getInviteLink
)

// Revoke invite link
router.put('/:jid/invite/revoke',
    query('id').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.revokeInviteLink
)

// Delete/Leave group
router.delete('/:jid',
    query('id').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.deleteGroup
)

export default router
