/**
 * Owner notifications without a third-party service.
 *
 * If NOTIFY_WEBHOOK_URL is set, the payload is POSTed there as JSON
 * ({ title, content }) — works with Slack/Discord-compatible webhook
 * receivers or anything you host. Otherwise notifications are logged
 * to the server console.
 */
export type NotificationPayload = {
  title: string;
  content: string;
};

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const title = payload.title?.trim();
  const content = payload.content?.trim();
  if (!title || !content) return false;

  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log(`[Notify] ${title}\n${content}`);
    return true;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` covers Slack-style webhooks; title/content for custom receivers
      body: JSON.stringify({ title, content, text: `${title}\n${content}` }),
    });
    if (!response.ok) {
      console.warn(`[Notify] Webhook failed (${response.status})`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notify] Webhook error:", error);
    return false;
  }
}
