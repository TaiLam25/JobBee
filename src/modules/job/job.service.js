const jobModel = require('./job.model');
const companyModel = require('../company/company.model');
const AppError = require('../../utils/app-error');
const db = require('../../config/db');

const getJobs = async (filters) => {
    return await jobModel.getJobs(filters);
};

const getSalaryRangeBounds = async () => {
    return await jobModel.getSalaryRangeBounds();
};

const getJobById = async (id) => {
    const job = await jobModel.getJobById(id);
    if (!job) {
        throw new AppError(404, 'Không tìm thấy tin tuyển dụng');
    }
    return job;
};

const MAX_ACTIVE_SMALL_JOBS = 2;

const createJob = async (accountId, data) => {
    const employer = await companyModel.getCompanyByAccountId(accountId);
    if (!employer) {
        throw new AppError(404, 'Tài khoản nhà tuyển dụng chưa được tạo');
    }

    // Validation for Salary
    const isNegotiable = Boolean(data.is_negotiable === true || data.is_negotiable === 'true');
    let salaryMin = null;
    let salaryMax = null;

    if (isNegotiable) {
        salaryMin = null;
        salaryMax = null;
    } else {
        salaryMin = parseInt(data.salary_min, 10);
        salaryMax = parseInt(data.salary_max, 10);

        if (isNaN(salaryMin) || isNaN(salaryMax) || salaryMin < 0 || salaryMax < 0 || salaryMin > salaryMax) {
            throw new AppError(400, 'Mức lương không hợp lệ. Lương tối thiểu và tối đa phải là số nguyên dương và Lương tối thiểu <= Lương tối đa.');
        }
    }

    // Business Rule 13: Unverified employers can ONLY post small_job. Full-time jobs require 'verified' status.
    if (data.job_type === 'full_time' && employer.verification_status !== 'verified') {
        throw new AppError(
            403,
            'Doanh nghiệp của bạn chưa được xác minh (status != verified). Chỉ doanh nghiệp đã xác minh mới được đăng tin tuyển dụng thông thường.'
        );
    }

    // Anti-spam rule for small job: Max 2 active small jobs per employer account
    if (data.job_type === 'small_job') {
        const activeRes = await db.query(
            `SELECT COUNT(*)::int as count 
             FROM job_posting jp 
             JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id 
             WHERE jp.employer_id = $1 AND jp.job_type = 'small_job' AND sjp.is_closed = FALSE`,
            [employer.id]
        );

        if (activeRes.rows[0].count >= MAX_ACTIVE_SMALL_JOBS) {
            throw new AppError(
                403,
                'Mỗi tài khoản chỉ được đăng tối đa 2 tin Small Job đang hoạt động cùng lúc. Vui lòng hoàn thành hoặc đóng bớt tin hiện có trước khi đăng thêm.'
            );
        }
    }

    // Transaction for creating job_posting, small_job_posting, and industry associations
    const result = await db.withTransaction(async (client) => {
        // Small job is auto-approved, full_time requires admin approval
        const initialStatus = data.job_type === 'small_job' ? 'approved' : 'pending';

        const job = await jobModel.createJobPosting(client, {
            employer_id: employer.id,
            title: data.title,
            job_description: data.job_description,
            requirements: data.requirements,
            salary_min: salaryMin,
            salary_max: salaryMax,
            is_negotiable: isNegotiable,
            location: data.location,
            job_type: data.job_type,
            province_id: data.province_id || null,
            tags: data.tags || [],
            approval_status: initialStatus,
        });

        // Insert industry tags
        if (data.industry_ids && Array.isArray(data.industry_ids)) {
            await jobModel.setJobIndustries(client, job.id, data.industry_ids);
        }

        if (data.job_type === 'small_job') {
            if (!data.working_hours || !data.number_of_days || !data.positions_needed || !data.start_time) {
                throw new AppError(400, 'Thiếu thông tin chi tiết việc làm ngắn hạn (working_hours, number_of_days, positions_needed, start_time)');
            }

            const smallJob = await jobModel.createSmallJobPosting(client, {
                job_posting_id: job.id,
                working_hours: data.working_hours,
                number_of_days: data.number_of_days,
                positions_needed: data.positions_needed,
                start_time: data.start_time,
            });

            return { ...job, small_job: smallJob };
        }

        return job;
    });

    return result;
};

const updateJob = async (accountId, jobId, data) => {
    const employer = await companyModel.getCompanyByAccountId(accountId);
    if (!employer) {
        throw new AppError(404, 'Tài khoản nhà tuyển dụng chưa được tạo');
    }

    if (data.is_negotiable !== undefined && !data.is_negotiable) {
        if (data.salary_min !== undefined && data.salary_max !== undefined) {
            const min = parseInt(data.salary_min, 10);
            const max = parseInt(data.salary_max, 10);
            if (isNaN(min) || isNaN(max) || min < 0 || max < 0 || min > max) {
                throw new AppError(400, 'Mức lương không hợp lệ. Lương tối thiểu và tối đa phải là số nguyên dương và Lương tối thiểu <= Lương tối đa.');
            }
        }
    }

    const updated = await jobModel.updateJobPosting(jobId, employer.id, data);
    if (!updated) {
        throw new AppError(404, 'Không tìm thấy tin tuyển dụng hoặc không có quyền sửa');
    }

    if (data.industry_ids !== undefined && Array.isArray(data.industry_ids)) {
        await jobModel.setJobIndustries(null, jobId, data.industry_ids);
    }

    return await jobModel.getJobById(jobId);
};

const deleteJob = async (accountId, jobId) => {
    const employer = await companyModel.getCompanyByAccountId(accountId);
    if (!employer) {
        throw new AppError(404, 'Tài khoản nhà tuyển dụng chưa được tạo');
    }
    await jobModel.deleteJobPosting(jobId, employer.id);
};

const getEmployerJobs = async (accountId) => {
    const employer = await companyModel.getCompanyByAccountId(accountId);
    if (!employer) {
        throw new AppError(404, 'Tài khoản nhà tuyển dụng chưa được tạo');
    }
    return await jobModel.getEmployerJobs(employer.id);
};

const getJobStats = async (accountId, jobId) => {
    const employer = await companyModel.getCompanyByAccountId(accountId);
    if (!employer) {
        throw new AppError(404, 'Tài khoản nhà tuyển dụng chưa được tạo');
    }
    const stats = await jobModel.getJobStats(jobId, employer.id);
    if (!stats) {
        throw new AppError(404, 'Không tìm thấy thông tin thống kê tin tuyển dụng này');
    }
    return stats;
};

const getPlatformStats = async () => {
    return await jobModel.getPlatformStats();
};

module.exports = {
    getJobs,
    getSalaryRangeBounds,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    getEmployerJobs,
    getJobStats,
    getPlatformStats,
};
