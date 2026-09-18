const express = require('express');
const multer = require('multer');
const aiController = require('./ai.controller');
const { authenticateToken, optionalAuthenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Memory storage for fast CV parsing (limit 5MB for CV analysis)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
});

// Middleware to accept either 'cv' or 'file' field name
const uploadCVFile = (req, res, next) => {
    upload.single('cv')(req, res, (err) => {
        if (err) return next(err);
        if (req.file) return next();
        upload.single('file')(req, res, next);
    });
};

// AI Chatbot: Public or logged in
router.post('/ai/chat', optionalAuthenticateToken, aiController.processChat);

// AI CV Analysis to Recommended Industries (New Candidate Feature)
router.post('/ai/cv-analysis', optionalAuthenticateToken, uploadCVFile, aiController.analyzeCV);
router.get('/ai/cv-analysis/history', authenticateToken, authorizeRoles('candidate'), aiController.getCVAnalysisHistory);

// AI CV Auto-Extraction to structured data
router.post('/ai/parse-cv-file', uploadCVFile, aiController.parseCVFile);

// Protected candidate AI routes
router.get('/ai/skill-advice', authenticateToken, authorizeRoles('candidate'), aiController.getSkillAdvice);
router.post('/ai/career-guidance', authenticateToken, authorizeRoles('candidate'), aiController.getCareerGuidance);

// Protected employer AI routes
router.post('/jobs/:id/ai-ranking', authenticateToken, authorizeRoles('employer'), aiController.rankCVs);

// Conversation history
router.get('/ai/conversations', authenticateToken, aiController.getConversations);

// Dashboard AI Insights & Statistics (Protected for all roles with role validation in controller)
router.get('/ai/dashboard-insight/:role', authenticateToken, aiController.getDashboardInsight);
router.get('/ai/insight/:role', authenticateToken, aiController.getDashboardInsight);

module.exports = router;
