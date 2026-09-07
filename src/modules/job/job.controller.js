const jobService = require('./job.service');
const { sendResponse } = require('../../utils/response');

const getJobs = async (req, res, next) => {
    try {
        const result = await jobService.getJobs(req.query);
        return sendResponse(res, 200, 'Lấy danh sách tin tuyển dụng thành công', result.jobs, result.meta);
    } catch (error) {
        next(error);
    }
};

const getJobById = async (req, res, next) => {
    try {
        const job = await jobService.getJobById(req.params.id);
        return sendResponse(res, 200, 'Lấy chi tiết tin tuyển dụng thành công', job);
    } catch (error) {
        next(error);
    }
};

const createJob = async (req, res, next) => {
    try {
        const job = await jobService.createJob(req.user.id, req.body);
        return sendResponse(res, 201, 'Đăng tin tuyển dụng thành công (đang chờ quản trị viên duyệt)', job);
    } catch (error) {
        next(error);
    }
};

const updateJob = async (req, res, next) => {
    try {
        const updated = await jobService.updateJob(req.user.id, req.params.id, req.body);
        return sendResponse(res, 200, 'Cập nhật tin tuyển dụng thành công', updated);
    } catch (error) {
        next(error);
    }
};

const deleteJob = async (req, res, next) => {
    try {
        await jobService.deleteJob(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Gỡ tin tuyển dụng thành công');
    } catch (error) {
        next(error);
    }
};

const getEmployerJobs = async (req, res, next) => {
    try {
        const jobs = await jobService.getEmployerJobs(req.user.id);
        return sendResponse(res, 200, 'Lấy danh sách tin đã đăng thành công', jobs);
    } catch (error) {
        next(error);
    }
};

const getJobStats = async (req, res, next) => {
    try {
        const stats = await jobService.getJobStats(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Lấy thống kê tin tuyển dụng thành công', stats);
    } catch (error) {
        next(error);
    }
};

const getPlatformStats = async (req, res, next) => {
    try {
        const stats = await jobService.getPlatformStats();
        return sendResponse(res, 200, 'Lấy thông số thống kê nền tảng thành công', stats);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getJobs,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    getEmployerJobs,
    getJobStats,
    getPlatformStats,
};
