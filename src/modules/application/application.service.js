const appModel = require('./application.model');
const profileModel = require('../profile/profile.model');
const jobModel = require('../job/job.model');
const notificationModel = require('../notification/notification.model');
const AppError = require('../../utils/app-error');
const db = require('../../config/db');

const submitApplication = async (candidateAccountId, { cv_version_id, job_posting_id }) => {
    const profile = await profileModel.getProfileByAccountId(candidateAccountId);
    if (!profile) {
        throw new AppError(404, 'Hồ sơ ứng viên chưa được khởi tạo');
    }

    const cv = await profileModel.getCVById(cv_version_id, profile.id);
    if (!cv) {
        throw new AppError(404, 'Bản CV lựa chọn không hợp lệ hoặc không thuộc về bạn');
    }

    const job = await jobModel.getJobById(job_posting_id);
    if (!job) {
        throw new AppError(404, 'Tin tuyển dụng không tồn tại');
    }

    // Check duplicate application (1 candidate can only apply once per job posting across all CVs)
    const existing = await appModel.findExistingApplicationByCandidate(candidateAccountId, job_posting_id);
    if (existing) {
        throw new AppError(409, 'Bạn đã nộp hồ sơ ứng tuyển vào tin tuyển dụng này rồi');
    }

    // Transaction: Create JobApplication + Create Notification for Employer (Requirement 5)
    return await db.withTransaction(async (client) => {
        const application = await appModel.createApplication(client, {
            cv_version_id,
            job_posting_id,
        });

        // Get employer's account_id
        const empResult = await client.query('SELECT account_id FROM employer WHERE id = $1', [job.employer_id]);
        if (empResult.rows.length > 0) {
            const employerAccountId = empResult.rows[0].account_id;
            await notificationModel.createNotification(client, {
                account_id: employerAccountId,
                title: 'Có ứng viên mới!',
                content: `Ứng viên ${profile.full_name} vừa nộp hồ sơ ứng tuyển cho vị trí "${job.title}".`,
                metadata: {
                    type: 'new_application',
                    job_posting_id: job.id,
                    job_title: job.title,
                    candidate_name: profile.full_name,
                    application_id: application.id,
                },
            });
        }

        return application;
    });
};

const getCandidateApplications = async (candidateAccountId) => {
    return await appModel.getCandidateApplications(candidateAccountId);
};

const getJobApplicationsForEmployer = async (employerAccountId, jobId) => {
    return await appModel.getJobApplicationsForEmployer(employerAccountId, jobId);
};

const updateStatus = async (employerAccountId, applicationId, status, note) => {
    // Check application & fetch candidate's account_id
    const appQuery = await db.query(
        `SELECT ja.*, jp.title as job_title, cp.account_id as candidate_account_id, e.company_name
         FROM job_application ja
         JOIN cv_version cv ON ja.cv_version_id = cv.id
         JOIN candidate_profile cp ON cv.profile_id = cp.id
         JOIN job_posting jp ON ja.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         WHERE ja.id = $1 AND e.account_id = $2`,
        [applicationId, employerAccountId]
    );

    if (appQuery.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy hồ sơ ứng tuyển hoặc bạn không có quyền cập nhật');
    }

    const appData = appQuery.rows[0];

    const statusMap = {
        submitted: 'Mới nộp',
        received: 'Đã tiếp nhận hồ sơ',
        under_review: 'Đang đánh giá chuyên môn',
        interview_invited: 'Mời tham gia phỏng vấn',
        interviewed: 'Đã hoàn thành phỏng vấn',
        passed: 'Trúng tuyển (Đạt)',
        rejected: 'Chưa phù hợp (Từ chối)',
        withdrawn: 'Ứng viên rút đơn',
    };
    const statusText = statusMap[status] || status;

    // Transaction: Update JobApplication status + Create Notification for Candidate (Requirement 5)
    return await db.withTransaction(async (client) => {
        const updated = await appModel.updateStatus(client, applicationId, status);

        const isPassed = status === 'passed';
        const title = isPassed ? '🎉 Chúc mừng bạn đã trúng tuyển!' : 'Cập nhật trạng thái hồ sơ ứng tuyển';
        const content = isPassed
            ? `Chúc mừng bạn đã trúng tuyển vị trí "${appData.job_title}" tại ${appData.company_name || 'Doanh nghiệp'}! ${note ? `Lời nhắn từ nhà tuyển dụng: "${note}"` : 'Hãy chuẩn bị sẵn sàng cho hành trình mới.'}`
            : (note
                ? `Hồ sơ ứng tuyển vị trí "${appData.job_title}" của bạn vừa chuyển sang trạng thái: "${statusText}". Lời nhắn từ nhà tuyển dụng: ${note}`
                : `Hồ sơ ứng tuyển vị trí "${appData.job_title}" của bạn vừa chuyển sang trạng thái: "${statusText}".`);

        await notificationModel.createNotification(client, {
            account_id: appData.candidate_account_id,
            title,
            content,
            metadata: {
                type: isPassed ? 'hired' : 'application_status_update',
                job_category: 'full_time',
                job_posting_id: appData.job_posting_id,
                job_title: appData.job_title,
                application_id: applicationId,
                company_name: appData.company_name,
                status,
                note: note || null,
            },
        });

        return updated;
    });
};

const withdrawApplication = async (candidateAccountId, applicationId) => {
    const withdrawn = await appModel.withdrawApplication(applicationId, candidateAccountId);
    if (!withdrawn) {
        throw new AppError(404, 'Không tìm thấy hồ sơ ứng tuyển để rút');
    }
    return withdrawn;
};

module.exports = {
    submitApplication,
    getCandidateApplications,
    getJobApplicationsForEmployer,
    updateStatus,
    withdrawApplication,
};
