const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Middleware xác thực (nếu cần thiết, giả định client sẽ gửi token lên)
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    // Ở đây ta có thể verify token với Supabase Admin, tạm thời lưu token vào req
    req.token = authHeader.split(' ')[1];
    next();
};

// Route AI
router.post('/gemini', authMiddleware, aiController.handleGeminiAction);

module.exports = router;
