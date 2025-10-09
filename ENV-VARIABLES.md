# Environment Variables Configuration

## Required Environment Variables

Add these to your Vercel project settings:

### Core Variables
```bash
# Airtable API Key (from Airtable account settings)
AIRTABLE_API_KEY=your_airtable_api_key_here

# Webhook Secret Token (generate with: openssl rand -hex 32)
WEBHOOK_SECRET_TOKEN=your_64_character_secure_token_here
```

## How to Add to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable above
5. Select **Production**, **Preview**, and **Development** for each
6. Click **Save**
7. Redeploy your application

## Generate Webhook Secret

```bash
openssl rand -hex 32
```

This will output a 64-character hexadecimal string. Use this as your `WEBHOOK_SECRET_TOKEN`.

## Security Notes

- ⚠️ **NEVER** commit these values to git
- ⚠️ Keep your API keys secure (backend only)
- ⚠️ The Webhook Secret must match between Vercel and Airtable automation
- ⚠️ Regenerate secrets if compromised

## Verification

After adding variables and redeploying, check:

```bash
# View recent function logs
vercel logs

# Look for API function logs to verify configuration
```

## Local Development

For local testing:

1. Create a `.env` file (already in .gitignore)
2. Add the variables listed above
3. Use `vercel dev` to run locally with environment variables

## Future: Alerts Platform Integration

This project is currently transitioning to a new alerts platform. Additional environment variables will be added here once the new platform is configured.

