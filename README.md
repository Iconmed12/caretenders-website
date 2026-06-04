# CareTenders UK

## Setup Instructions

### 1. Deploy to Netlify
- Push this entire folder to your GitHub repository
- Netlify will auto-deploy

### 2. Environment Variables in Netlify
Go to Site Configuration → Environment Variables and add:
- `SUPABASE_URL` = https://igpjfpncfuawikoyzfcd.supabase.co
- `SUPABASE_ANON_KEY` = your Supabase anon key
- `ANTHROPIC_API_KEY` = your Anthropic API key (from Netlify env vars)

### 3. Admin Panel
Visit: https://your-site.netlify.app/admin.html
Password: CareTenders2024!

Change the password in admin.html line: const ADMIN_PASSWORD = 'CareTenders2024!';

### 4. Public Site
Visit: https://your-site.netlify.app
