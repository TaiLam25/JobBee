const express = require('express');
const smallJobController = require('./small_job.controller');
const { authenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Public
router.get('/small-jobs', smallJobController.getSmallJobs);

// Candidate
router.get('/small-jobs/registrations/mine', authenticateToken, authorizeRoles('candidate'), smallJobController.getMyRegistrations);
router.post('/small-jobs/:jobId/register', authenticateToken, authorizeRoles('candidate'), smallJobController.registerSmallJob);
router.post('/small-jobs/:jobId/cancel', authenticateToken, authorizeRoles('candidate'), smallJobController.cancelRegistration);
router.delete('/small-jobs/:jobId/register', authenticateToken, authorizeRoles('candidate'), smallJobController.cancelRegistration);

// Employer
router.get('/small-jobs/:jobId/registrations', authenticateToken, authorizeRoles('employer'), smallJobController.getRegistrations);
router.get('/small-jobs/:jobId/stats', authenticateToken, authorizeRoles('employer'), smallJobController.getSmallJobStats);
router.put('/small-jobs/:jobId/complete', authenticateToken, authorizeRoles('employer'), smallJobController.completeSmallJob);
router.put('/small-jobs/:jobId/confirm-list', authenticateToken, authorizeRoles('employer'), smallJobController.confirmList);
router.put('/small-jobs/registrations/:id/status', authenticateToken, authorizeRoles('employer'), smallJobController.updateRegistrationStatus);

module.exports = router;
