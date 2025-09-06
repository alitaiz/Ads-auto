// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routers
import spSearchTermRoutes from './routes/spSearchTerms.js';
import ppcManagementRoutes from './routes/ppcManagement.js';
import streamRoutes from './routes/stream.js';
import ppcManagementApiRoutes from './routes/ppcManagementApi.js'; // Import the new router

// --- Cấu hình ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Đảm bảo server load đúng file .env trong thư mục backend
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 4001;

// --- Middleware ---
// Cho phép các yêu cầu từ các domain khác (cần thiết cho frontend)
app.use(cors());
// Phân tích các request body có định dạng JSON
app.use(express.json());

// --- Gắn kết các Router ---
// Routes for getting data from our local PostgreSQL DB
app.use('/api', spSearchTermRoutes);
app.use('/api', ppcManagementRoutes);
app.use('/api', streamRoutes);

// Routes for interacting directly with the Amazon Ads API
app.use('/api/amazon', ppcManagementApiRoutes);


// Route cơ bản để kiểm tra server có đang chạy không
app.get('/', (req, res) => {
  res.send('PPC Auto Backend is running!');
});

// --- Khởi động Server ---
app.listen(port, () => {
  console.log(`Backend server đang lắng nghe tại http://localhost:${port}`);
  if (!process.env.DB_USER || !process.env.ADS_API_CLIENT_ID) {
      console.warn('CẢNH BÁO: Các biến môi trường cần thiết (ví dụ: DB_USER, ADS_API_CLIENT_ID) chưa được thiết lập. Vui lòng kiểm tra file backend/.env của bạn.');
  }
});