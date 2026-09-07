const smallJobService = require('./small_job.service');
const { sendResponse } = require('../../utils/response');

const getSmallJobs = async (req, res, next) => {
    try {
        const result = await smallJobService.getSmallJobs(req.query);
        return sendResponse(res, 200, 'Lấy danh sách Small Job thành công', result.small_jobs, result.meta);
    } catch (error) {
        next(error);
    }
};

const registerSmallJob = async (req, res, next) => {
    try {
        const reg = await smallJobService.registerSmallJob(req.user.id, req.params.jobId);
        return sendResponse(res, 201, 'Đăng ký tham gia Small Job thành công', reg);
    } catch (error) {
        next(error);
    }
};

const cancelRegistration = async (req, res, next) => {
    try {
        await smallJobService.cancelRegistration(req.user.id, req.params.jobId, req.body?.reason);
        return sendResponse(res, 200, 'Hủy đăng ký tham gia thành công');
    } catch (error) {
        next(error);
    }
};

const getRegistrations = async (req, res, next) => {
    try {
        const list = await smallJobService.getRegistrations(req.user.id, req.params.jobId);
        return sendResponse(res, 200, 'Lấy danh sách ứng viên đăng ký Small Job thành công', list);
    } catch (error) {
        next(error);
    }
};

const confirmList = async (req, res, next) => {
    try {
        const result = await smallJobService.confirmList(req.user.id, req.params.jobId, req.body.account_ids || []);
        return sendResponse(res, 200, 'Xác nhận danh sách chính thức thành công', result);
    } catch (error) {
        next(error);
    }
};

const updateRegistrationStatus = async (req, res, next) => {
    try {
        const updated = await smallJobService.updateRegistrationStatus(req.user.id, req.params.id, req.body.status);
        return sendResponse(res, 200, 'Cập nhật trạng thái tham gia thành công', updated);
    } catch (error) {
        next(error);
    }
};

const completeSmallJob = async (req, res, next) => {
    try {
        const result = await smallJobService.completeSmallJob(req.user.id, req.params.jobId);
        return sendResponse(res, 200, 'Hoàn thành ca làm việc thành công', result);
    } catch (error) {
        next(error);
    }
};

const getSmallJobStats = async (req, res, next) => {
    try {
        const stats = await smallJobService.getSmallJobStats(req.user.id, req.params.jobId);
        return sendResponse(res, 200, 'Lấy thống kê ca làm việc thành công', stats);
    } catch (error) {
        next(error);
    }
};

const getMyRegistrations = async (req, res, next) => {
    try {
        const list = await smallJobService.getMyRegistrations(req.user.id);
        return sendResponse(res, 200, 'Lấy danh sách ca làm việc đã đăng ký thành công', list);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSmallJobs,
    registerSmallJob,
    cancelRegistration,
    getRegistrations,
    confirmList,
    updateRegistrationStatus,
    completeSmallJob,
    getSmallJobStats,
    getMyRegistrations,
};
