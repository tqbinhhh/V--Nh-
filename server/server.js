const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ error: 'Lỗi server nội bộ', details: err.message });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend Server đang chạy tại http://localhost:${PORT}`);
});
