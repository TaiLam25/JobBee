const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

const isPlaceholder = !process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder') || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder');

let supabase = null;
if (!isPlaceholder) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        console.warn('Supabase client init warning:', e.message);
    }
}

/**
 * Save file locally as fallback
 */
const saveLocally = (bucket, filePath, fileBuffer) => {
    const sanitizedPath = filePath.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const uploadDir = path.join(__dirname, '../../public/uploads', bucket);
    fs.mkdirSync(uploadDir, { recursive: true });
    const localFilePath = path.join(uploadDir, sanitizedPath);
    fs.writeFileSync(localFilePath, fileBuffer);
    return `/uploads/${bucket}/${sanitizedPath}`;
};

/**
 * Upload a file to Supabase Storage bucket with auto-create & local fallback
 * @param {string} bucket - Bucket name (e.g. 'cv-files', 'avatars', 'verification-docs')
 * @param {string} filePath - Path inside bucket
 * @param {Buffer} fileBuffer - File content buffer
 * @param {string} mimeType - File mime type
 */
const uploadToSupabase = async (bucket, filePath, fileBuffer, mimeType) => {
    if (!supabase) {
        return saveLocally(bucket, filePath, fileBuffer);
    }

    try {
        let { data, error } = await supabase.storage
            .from(bucket)
            .upload(filePath, fileBuffer, {
                contentType: mimeType,
                upsert: true,
            });

        // If bucket does not exist, attempt to auto-create it
        if (error && (error.message?.includes('Bucket not found') || error.error === 'Bucket not found' || error.statusCode === '404' || error.code === 'NoSuchBucket' || error.status === 404)) {
            console.log(`[Storage] Bucket "${bucket}" not found. Attempting to create bucket automatically...`);
            try {
                const { error: createErr } = await supabase.storage.createBucket(bucket, {
                    public: true,
                });
                if (!createErr) {
                    // Retry upload
                    const retry = await supabase.storage
                        .from(bucket)
                        .upload(filePath, fileBuffer, {
                            contentType: mimeType,
                            upsert: true,
                        });
                    data = retry.data;
                    error = retry.error;
                }
            } catch (createEx) {
                console.warn(`[Storage] Auto bucket creation failed for "${bucket}":`, createEx.message);
            }
        }

        if (error) {
            console.warn(`[Storage] Supabase upload failed for "${bucket}/${filePath}": ${error.message || error.error}. Falling back to local storage.`);
            return saveLocally(bucket, filePath, fileBuffer);
        }

        const { data: publicUrlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    } catch (err) {
        console.warn(`[Storage] Supabase storage exception: ${err.message}. Falling back to local storage.`);
        return saveLocally(bucket, filePath, fileBuffer);
    }
};

module.exports = {
    supabase,
    uploadToSupabase,
};
