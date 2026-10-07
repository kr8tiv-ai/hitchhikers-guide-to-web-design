import "../form.css";

export function ContactForm({
  action,
  provider,
  accessKey,
}: {
  action: string;
  provider: string;
  accessKey?: string;
}): React.JSX.Element {
  return (
    <form className="hh-form" method="post" action={action} data-provider={provider}>
      {accessKey ? <input type="hidden" name="access_key" value={accessKey} /> : null}
      <label>
        Name
        <input name="name" autoComplete="name" required />
      </label>
      <label>
        Email
        <input name="email" type="email" inputMode="email" autoComplete="email" required />
      </label>
      <label>
        Message
        <textarea name="message" required />
      </label>
      <div className="hh-honeypot">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit">Send</button>
    </form>
  );
}
