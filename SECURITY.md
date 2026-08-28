# Security

Never commit an API key or bearer token. Configure DeepSeek credentials through
the `DEEPSEEK_API_KEY` environment variable (or the profile credential store)
on the machine running DSH. The desktop shell inherits environment variables
for the child server and never places credentials in command-line arguments,
window URLs, packaged files, logs, or release artifacts.

If a credential is exposed, revoke and rotate it immediately, then open a
private report with the repository owner rather than filing a public issue.
