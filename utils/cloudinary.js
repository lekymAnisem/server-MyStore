const config = require('../config');

const isConfigured = config.cloudinary.cloudName &&
  config.cloudinary.cloudName !== 'your_cloud_name' &&
  config.cloudinary.apiKey &&
  config.cloudinary.apiKey !== 'your_api_key';

let cloudinary;
if (isConfigured) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

const uploadToCloudinary = async (filePath, folder = 'mystore') => {
  if (!isConfigured || !cloudinary) {
    const filename = filePath.split(/[\\/]/).pop();
    return `/uploads/${filename}`;
  }
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto',
    });
    return result.secure_url;
  } catch (error) {
    console.error('[Cloudinary] Upload failed:', error.message);
    const filename = filePath.split(/[\\/]/).pop();
    return `/uploads/${filename}`;
  }
};

const deleteFromCloudinary = async (publicId) => {
  if (!isConfigured || !cloudinary) return;
  try {
    await cloudinary.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete failed:', error.message);
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };