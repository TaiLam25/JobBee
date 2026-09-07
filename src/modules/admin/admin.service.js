const adminModel = require('./admin.model');
const notificationModel = require('../notification/notification.model');
const AppError = require('../../utils/app-error');
const db = require('../../config/db');

const getPendingEmployers = async (query) => {
    return await adminModel.getPendingEmployers(query);
};

const getEmployers = async (query) => {
    return await adminModel.getEmployers(query);
};

const getEmployerDetail = async (employerId) => {
    const detail = await adminModel.getEmployerDetail(employerId);
    if (!detail) {
        throw new AppError(404, 'Không tìm thấy thông tin doanh nghiệp');
    }
    return detail;
};

const getSignedVerificationDocUrl = async (employerId) => {
    const empRes = await db.query(
        'SELECT id, company_name, verification_document FROM employer WHERE id = $1',
        [employerId]
    );

    if (empRes.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy thông tin doanh nghiệp');
    }

    const doc = empRes.rows[0].verification_document;
    if (!doc || !doc.trim()) {
        return {
            hasDocument: false,
            message: 'Doanh nghiệp chưa nộp tài liệu xác minh',
            signedUrl: null,
            fileType: null,
            fileName: null,
            originalUrl: null,
        };
    }

    const cleanDoc = doc.trim();
    let fileType = 'other';
    const lowerDoc = cleanDoc.toLowerCase().split('?')[0];
    if (lowerDoc.endsWith('.pdf') || lowerDoc.includes('pdf')) {
        fileType = 'pdf';
    } else if (lowerDoc.endsWith('.docx') || lowerDoc.endsWith('.doc') || lowerDoc.includes('word')) {
        fileType = 'docx';
    } else if (lowerDoc.endsWith('.jpg') || lowerDoc.endsWith('.jpeg') || lowerDoc.endsWith('.png') || lowerDoc.endsWith('.webp')) {
        fileType = 'image';
    }

    // Extract filename from URL or path
    let rawFileName = cleanDoc.split('?')[0].split('/').pop() || `doc_${employerId}.${fileType}`;

    // Determine signed URL via Supabase Storage if applicable
    const { supabase } = require('../../config/supabase');
    let finalUrl = cleanDoc;

    if (supabase) {
        let storageFilePath = null;
        if (cleanDoc.includes('verification-docs/')) {
            const parts = cleanDoc.split('verification-docs/');
            storageFilePath = parts[1]?.split('?')[0];
        } else if (!cleanDoc.startsWith('http://') && !cleanDoc.startsWith('https://') && !cleanDoc.startsWith('/uploads/') && !cleanDoc.startsWith('data:')) {
            storageFilePath = cleanDoc;
        }

        if (storageFilePath) {
            try {
                const { data: signedData, error: signErr } = await supabase.storage
                    .from('verification-docs')
                    .createSignedUrl(storageFilePath, 900); // 15 minutes validity

                if (!signErr && signedData?.signedUrl) {
                    finalUrl = signedData.signedUrl;
                    rawFileName = storageFilePath.split('/').pop() || rawFileName;
                }
            } catch (signEx) {
                console.warn('[Storage] Error generating signed URL:', signEx.message);
            }
        }
    }

    return {
        hasDocument: true,
        companyName: empRes.rows[0].company_name,
        signedUrl: finalUrl,
        fileType,
        fileName: rawFileName,
        originalUrl: cleanDoc,
        expiresInSeconds: 900,
    };
};

const verifyEmployer = async (employerId, { status }) => {
    if (!['verified', 'rejected'].includes(status)) {
        throw new AppError(400, 'Trạng thái xét duyệt phải là verified hoặc rejected');
    }

    const empRes = await db.query('SELECT account_id, company_name FROM employer WHERE id = $1', [employerId]);
    if (empRes.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy thông tin doanh nghiệp');
    }

    const empData = empRes.rows[0];

    // Transaction: Verify Employer + Create Notification for Employer (Requirement 5)
    return await db.withTransaction(async (client) => {
        const updated = await adminModel.verifyEmployer(client, employerId, status);

        const statusText = status === 'verified' ? 'được PHÊ DUYỆT' : 'bị TỪ CHỐI';
        await notificationModel.createNotification(client, {
            account_id: empData.account_id,
            title: 'Kết quả xét duyệt xác minh doanh nghiệp',
            content: `Hồ sơ xác minh doanh nghiệp "${empData.company_name}" của bạn đã ${statusText} bởi quản trị viên.`,
        });

        return updated;
    });
};

const getPendingJobs = async (query) => {
    return await adminModel.getPendingJobs(query);
};

const moderateJob = async (jobId, { status }) => {
    if (!['approved', 'rejected', 'hidden'].includes(status)) {
        throw new AppError(400, 'Trạng thái kiểm duyệt không hợp lệ');
    }

    const jobRes = await db.query(
        `SELECT jp.title, e.account_id 
         FROM job_posting jp 
         JOIN employer e ON jp.employer_id = e.id 
         WHERE jp.id = $1`,
        [jobId]
    );

    if (jobRes.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy tin tuyển dụng');
    }

    const jobData = jobRes.rows[0];

    // Transaction: Moderate Job + Create Notification (Requirement 5)
    return await db.withTransaction(async (client) => {
        const updated = await adminModel.moderateJob(client, jobId, status);

        await notificationModel.createNotification(client, {
            account_id: jobData.account_id,
            title: 'Kết quả kiểm duyệt tin tuyển dụng',
            content: `Tin tuyển dụng "${jobData.title}" của bạn vừa được quản trị viên cập nhật trạng thái: ${status}.`,
        });

        return updated;
    });
};

const getAccounts = async (query) => {
    return await adminModel.getAccounts(query);
};

const toggleLockAccount = async (accountId, { is_locked }) => {
    const updated = await adminModel.toggleLockAccount(accountId, is_locked);
    if (!updated) {
        throw new AppError(404, 'Không tìm thấy tài khoản để khóa/mở khóa');
    }
    return updated;
};

const getStatistics = async () => {
    return await adminModel.getStatistics();
};

const getAdminAnalytics = async (query = {}) => {
    const { range = '30d' } = query;
    return await adminModel.getAdminAnalytics(range);
};

module.exports = {
    getPendingEmployers,
    getEmployers,
    getEmployerDetail,
    getSignedVerificationDocUrl,
    verifyEmployer,
    getPendingJobs,
    moderateJob,
    getAccounts,
    toggleLockAccount,
    getStatistics,
    getAdminAnalytics,
};
