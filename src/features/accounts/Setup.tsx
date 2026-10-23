// First start: no account exists yet. The setup code from the server log makes the first admin (POST /api/setup),
// who is signed in straight away. Runners saved before accounts become theirs (server/server.mjs).
import { useState } from 'react'
import { PasswordField, send, type User } from '../../core/ui-kit/auth'
import { GatePage } from './SignIn'

/** codeless: the desktop app (server openSetup): no setup code, the admin is made right here. */
export function Setup({ onDone, codeless = false }: { onDone: (u: User) => void; codeless?: boolean }) {
  const [code, setCode] = useState(''),
    [name, setName] = useState(''),
    [username, setUsername] = useState('')
  const [pw, setPw] = useState(''),
    [again, setAgain] = useState('')
  const [err, setErr] = useState(''),
    [busy, setBusy] = useState(false)
  const submit = async () => {
    if (pw !== again) return setErr('The passwords don’t match. Type the same one twice.')
    setBusy(true)
    setErr('')
    try {
      onDone((await (await send('setup', { code, name, username, password: pw })).json()).user)
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <GatePage
      title="Set up the first admin"
      busy={busy}
      err={err}
      onSubmit={() => void submit()}
      action="Create admin account"
      intro={
        codeless ? (
          <p>No accounts exist yet. Create the admin account that guards Setup and manages this app.</p>
        ) : (
          <p>
            This server has no accounts yet. The setup code is in the container’s log (on Unraid: the Docker tab, the app’s icon, Logs). It changes every time
            the server starts.
          </p>
        )
      }
    >
      {!codeless && (
        <label>
          Setup code
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            autoFocus
            placeholder="XXXX-XXXX-XXXX"
          />
        </label>
      )}
      <label>
        Your name
        <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} />
      </label>
      <label>
        Username
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={2}
          maxLength={32}
          pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,31}"
          title="2–32 letters, digits, dots, dashes or underscores"
        />
      </label>
      <PasswordField label="Password" value={pw} onChange={setPw} autoComplete="new-password" />
      <PasswordField label="Password again" value={again} onChange={setAgain} autoComplete="new-password" hint={false} />
    </GatePage>
  )
}
