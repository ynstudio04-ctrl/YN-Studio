const multer = require('multer');

const paymentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg','image/png','image/webp','application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) return cb(new Error('Only JPG, PNG, WEBP, and PDF files are allowed.'));
    cb(null, true);
  },
});

const requestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg','image/png','image/webp','application/pdf','image/gif'];
    if (!allowedTypes.includes(file.mimetype)) return cb(new Error('Only JPG, PNG, WEBP, GIF and PDF files are allowed.'));
    cb(null, true);
  },
});

module.exports = { paymentUpload, requestUpload };
