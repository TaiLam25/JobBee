const profileService = require('./profile.service');
const { sendResponse } = require('../../utils/response');

const getMyProfile = async (req, res, next) => {
    try {
        const profile = await profileService.getMyProfile(req.user.id);
        return sendResponse(res, 200, 'Lấy thông tin hồ sơ ứng viên thành công', profile);
    } catch (error) {
        next(error);
    }
};

const updateMyProfile = async (req, res, next) => {
    try {
        const updated = await profileService.updateMyProfile(req.user.id, req.body, req.file);
        return sendResponse(res, 200, 'Cập nhật hồ sơ thành công', updated);
    } catch (error) {
        next(error);
    }
};

const getMyCVs = async (req, res, next) => {
    try {
        const cvs = await profileService.getMyCVs(req.user.id);
        return sendResponse(res, 200, 'Lấy danh sách CV thành công', cvs);
    } catch (error) {
        next(error);
    }
};

const getCVById = async (req, res, next) => {
    try {
        const cv = await profileService.getCVById(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Lấy chi tiết CV thành công', cv);
    } catch (error) {
        next(error);
    }
};

const createCV = async (req, res, next) => {
    try {
        const cv = await profileService.createCV(req.user.id, req.body, req.file);
        return sendResponse(res, 201, 'Tạo bản CV mới thành công', cv);
    } catch (error) {
        next(error);
    }
};

const updateCV = async (req, res, next) => {
    try {
        const updated = await profileService.updateCV(req.user.id, req.params.id, req.body, req.file);
        return sendResponse(res, 200, 'Cập nhật CV thành công', updated);
    } catch (error) {
        next(error);
    }
};

const deleteCV = async (req, res, next) => {
    try {
        await profileService.deleteCV(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Xóa bản CV thành công');
    } catch (error) {
        next(error);
    }
};

const setDefaultCV = async (req, res, next) => {
    try {
        const cv = await profileService.setDefaultCV(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Đã đặt làm CV mặc định', cv);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    getMyCVs,
    getCVById,
    createCV,
    updateCV,
    deleteCV,
    setDefaultCV,
};
