const express = require('express');
const jobController = require('./job.controller');
const { authenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Employer routes (specific paths first)
router.get('/jobs/mine', authenticateToken, authorizeRoles('employer'), jobController.getEmployerJobs);
router.post('/jobs', authenticateToken, authorizeRoles('employer'), jobController.createJob);
router.put('/jobs/:id', authenticateToken, authorizeRoles('employer'), jobController.updateJob);
router.delete('/jobs/:id', authenticateToken, authorizeRoles('employer'), jobController.deleteJob);
router.get('/jobs/:id/stats', authenticateToken, authorizeRoles('employer'), jobController.getJobStats);

// Public routes (specific paths first)
router.get('/jobs/platform-stats', jobController.getPlatformStats);
router.get('/jobs/salary-range', jobController.getSalaryRange);
router.get('/jobs', jobController.getJobs);
router.get('/jobs/:id', jobController.getJobById);

module.exports = router;
