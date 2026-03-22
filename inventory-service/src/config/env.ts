import { config } from 'dotenv';

config({ path: `.env.local`, override: true });

// Use process.env directly since @nestjs/config will handle validation
export {};
