const express = require('express');
const profileController = require('./profile.controller');
const { authenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');
const { uploadCV, uploadImage } = require('../../middlewares/upload.middleware');

const router = express.Router();

const candAuth = [authenticateToken, authorizeRoles('candidate')];

router.get('/profiles/me', candAuth, profileController.getMyProfile);
router.put('/profiles/me', candAuth, uploadImage.single('avatar'), profileController.updateMyProfile);

router.get('/profiles/me/cvs', candAuth, profileController.getMyCVs);
router.post('/profiles/me/cvs', candAuth, uploadCV.single('attachment'), profileController.createCV);
router.get('/profiles/me/cvs/:id', candAuth, profileController.getCVById);
router.put('/profiles/me/cvs/:id', candAuth, uploadCV.single('attachment'), profileController.updateCV);
router.delete('/profiles/me/cvs/:id', candAuth, profileController.deleteCV);
router.put('/profiles/me/cvs/:id/set-default', candAuth, profileController.setDefaultCV);

module.exports = router;
