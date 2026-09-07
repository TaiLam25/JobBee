const express = require('express');
const appController = require('./application.controller');
const { authenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Candidate
router.post('/applications', authenticateToken, authorizeRoles('candidate'), appController.submitApplication);
router.get('/applications/me', authenticateToken, authorizeRoles('candidate'), appController.getCandidateApplications);
router.delete('/applications/:id', authenticateToken, authorizeRoles('candidate'), appController.withdrawApplication);

// Employer
router.get('/jobs/:id/applications', authenticateToken, authorizeRoles('employer'), appController.getJobApplicationsForEmployer);
router.put('/applications/:id/status', authenticateToken, authorizeRoles('employer'), appController.updateStatus);

module.exports = router;
