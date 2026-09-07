const express = require('express');
const multer = require('multer');
const aiController = require('./ai.controller');
const { authenticateToken, optionalAuthenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Memory storage for fast CV parsing
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// AI Chatbot: Public or logged in
router.post('/ai/chat', optionalAuthenticateToken, aiController.processChat);

// AI CV File Matching (PDF, DOCX, TXT upload)
router.post('/ai/match-cv-file', optionalAuthenticateToken, upload.single('file'), aiController.analyzeCVFile);

// AI CV Auto-Extraction to structured data
router.post('/ai/parse-cv-file', upload.single('file'), aiController.parseCVFile);

// Protected candidate AI routes
router.post('/ai/match-analysis', authenticateToken, authorizeRoles('candidate'), aiController.analyzeMatch);
router.get('/ai/job-suggestions', authenticateToken, authorizeRoles('candidate'), aiController.getJobSuggestions);
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
