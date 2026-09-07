const appService = require('./application.service');
const { sendResponse } = require('../../utils/response');

const submitApplication = async (req, res, next) => {
    try {
        const app = await appService.submitApplication(req.user.id, req.body);
        return sendResponse(res, 201, 'Nộp hồ sơ ứng tuyển thành công', app);
    } catch (error) {
        next(error);
    }
};

const getCandidateApplications = async (req, res, next) => {
    try {
        const apps = await appService.getCandidateApplications(req.user.id);
        return sendResponse(res, 200, 'Lấy danh sách hồ sơ ứng tuyển đã nộp thành công', apps);
    } catch (error) {
        next(error);
    }
};

const getJobApplicationsForEmployer = async (req, res, next) => {
    try {
        const apps = await appService.getJobApplicationsForEmployer(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Lấy danh sách ứng viên theo tin tuyển dụng thành công', apps);
    } catch (error) {
        next(error);
    }
};

const updateStatus = async (req, res, next) => {
    try {
        const updated = await appService.updateStatus(req.user.id, req.params.id, req.body.status, req.body.note);
        return sendResponse(res, 200, 'Cập nhật trạng thái xử lý hồ sơ thành công', updated);
    } catch (error) {
        next(error);
    }
};

const withdrawApplication = async (req, res, next) => {
    try {
        const withdrawn = await appService.withdrawApplication(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Rút hồ sơ ứng tuyển thành công', withdrawn);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitApplication,
    getCandidateApplications,
    getJobApplicationsForEmployer,
    updateStatus,
    withdrawApplication,
};
