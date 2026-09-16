# Change the Login-Page Name

The login page reads its displayed name from `VITE_LOGIN_PAGE_NAME`. This setting is used only by `client/src/pages/Home.tsx`; it does not rename the authenticated dashboard or change Firebase, TMDB, or YouTube configuration.

In the project-root `.env` file, add or update this line:

```env
VITE_LOGIN_PAGE_NAME=Your Name
```

Replace `Your Name` with the text you want to display. Do not add quotation marks unless the name itself contains them. After saving the `.env` file, restart the development server so Vite reloads the variable:

```powershell
pnpm dev
```

If the setting is omitted, the login page falls back to `Vibe`.

Do not share the `.env` file or commit it to source control. Keep API keys and other credentials in `.env` only.
