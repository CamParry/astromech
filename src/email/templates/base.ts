/**
 * Base HTML email layout.
 */
export function baseLayout(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
    .body { padding: 32px 40px; color: #18181b; font-size: 15px; line-height: 1.6; }
    .footer { padding: 16px 40px; background: #f4f4f5; color: #71717a; font-size: 12px; text-align: center; }
    a { color: #2563eb; }
    .btn { display: inline-block; margin: 24px 0; padding: 12px 24px; background: #18181b; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="body">${content}</div>
    <div class="footer">This email was sent by Astromech CMS.</div>
  </div>
</body>
</html>`;
}
