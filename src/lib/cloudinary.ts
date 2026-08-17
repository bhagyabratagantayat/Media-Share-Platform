import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'bbty6ctr',
  api_key: process.env.CLOUDINARY_API_KEY || '769223324249544',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'oKk-BtSMAYh2ndLAbZn_Fbyb4tg',
  secure: true,
});

export { cloudinary };
export default cloudinary;
