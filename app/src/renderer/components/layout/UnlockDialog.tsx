import { useState } from 'react'
import { Lock, Loader2 } from 'lucide-react'
import { useSetupVault, useUnlockVault, type VaultStatus } from '../../api/auth'

interface Props {
  status: VaultStatus
}

export function UnlockDialog({ status }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const setupMutation = useSetupVault()
  const unlockMutation = useUnlockVault()

  const isSetup = !status.initialized

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isSetup && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    try {
      if (isSetup) {
        await setupMutation.mutateAsync(password)
      } else {
        await unlockMutation.mutateAsync(password)
      }
    } catch (err: any) {
      setError(err.message || 'Invalid password')
    }
  }

  const isPending = setupMutation.isPending || unlockMutation.isPending

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '24px'
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          backgroundColor: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Lock size={24} style={{ color: 'var(--primary)' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>Ferrite</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>
          {isSetup ? 'Set a master password to encrypt your credentials' : 'Enter your master password to unlock'}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          width: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
          autoFocus
          style={inputStyle}
        />

        {isSetup && (
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            style={inputStyle}
          />
        )}

        {error && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--destructive)',
              textAlign: 'center'
            }}
          >
            {error}
          </div>
        )}

        <button type="submit" disabled={isPending} style={btnStyle}>
          {isPending ? (
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          ) : isSetup ? (
            'Create Vault'
          ) : (
            'Unlock'
          )}
        </button>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '14px',
  color: 'var(--foreground)',
  outline: 'none',
  width: '100%',
  textAlign: 'center'
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  border: 'none',
  borderRadius: '8px',
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
}
