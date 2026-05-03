import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptureFromUrlDialog } from './CaptureFromUrlDialog'

const capture = vi.fn()
let hookState = {
  status: 'idle' as 'idle' | 'pending' | 'success' | 'error',
  notePath: null as string | null,
  error: null as string | null,
}

vi.mock('../hooks/useCaptureFromUrl', () => ({
  useCaptureFromUrl: () => ({ ...hookState, capture }),
}))

beforeEach(() => {
  capture.mockReset()
  hookState = { status: 'idle', notePath: null, error: null }
})

function urlInput() {
  return screen.getByRole('textbox', { name: /^url$/i })
}

describe('CaptureFromUrlDialog', () => {
  it('renders an input and a disabled Capture button when empty', () => {
    render(<CaptureFromUrlDialog open onOpenChange={() => {}} />)

    expect(urlInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^capture$/i })).toBeDisabled()
  })

  it('enables the button once a URL is typed', async () => {
    render(<CaptureFromUrlDialog open onOpenChange={() => {}} />)

    fireEvent.change(urlInput(), { target: { value: 'https://example.com/post' } })

    expect(screen.getByRole('button', { name: /^capture$/i })).toBeEnabled()
  })

  it('captures the trimmed URL and closes after success', async () => {
    const onCaptured = vi.fn()
    const onOpenChange = vi.fn()
    capture.mockResolvedValue('/vault/test-article.md')
    render(<CaptureFromUrlDialog open vaultPath="/vault" onCaptured={onCaptured} onOpenChange={onOpenChange} />)

    fireEvent.change(urlInput(), { target: { value: '  https://example.com/post  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^capture$/i }))

    await waitFor(() => expect(capture).toHaveBeenCalledWith('https://example.com/post'))
    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith('/vault/test-article.md'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows pending copy and disables controls while capturing', () => {
    hookState = { status: 'pending', notePath: null, error: null }

    render(<CaptureFromUrlDialog open onOpenChange={() => {}} />)

    expect(screen.getByRole('button', { name: /capturing/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    expect(urlInput()).toBeDisabled()
  })

  it('renders capture errors', () => {
    hookState = { status: 'error', notePath: null, error: 'fetch failed: 500' }

    render(<CaptureFromUrlDialog open onOpenChange={() => {}} />)

    expect(screen.getByRole('alert')).toHaveTextContent('fetch failed: 500')
  })
})
