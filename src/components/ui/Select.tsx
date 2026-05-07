'use client'

import { useState, useEffect, useRef, useId, useMemo, ReactNode, KeyboardEvent } from 'react'

export interface SelectOption {
  value: string
  label: ReactNode
  searchText?: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  error?: boolean
  searchable?: boolean
  searchThreshold?: number
  className?: string
  onBlur?: () => void
  disabled?: boolean
  id?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
}

const PANEL_MAX_HEIGHT = 280

export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecciona',
  required,
  error,
  searchable: searchableProp,
  searchThreshold = 10,
  className,
  onBlur,
  disabled,
  id,
  ariaLabelledBy,
  ariaDescribedBy,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [flipped, setFlipped] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])

  const reactId = useId()
  const listboxId = `${reactId}-listbox`

  const searchable = searchableProp ?? options.length >= searchThreshold

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options
    const q = query.toLowerCase().trim()
    return options.filter((opt) => {
      const text = opt.searchText ?? (typeof opt.label === 'string' ? opt.label : '')
      return text.toLowerCase().includes(q)
    })
  }, [options, query, searchable])

  const selected = options.find((o) => o.value === value)

  function getFirstEnabled(list: SelectOption[] = filtered): number {
    return list.findIndex((o) => !o.disabled)
  }
  function getLastEnabled(list: SelectOption[] = filtered): number {
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].disabled) return i
    return -1
  }
  function getNextEnabled(start: number, dir: 1 | -1): number {
    const len = filtered.length
    if (len === 0) return -1
    let i = start < 0 ? (dir === 1 ? -1 : len) : start
    for (let n = 0; n < len; n++) {
      i = (i + dir + len) % len
      if (!filtered[i].disabled) return i
    }
    return -1
  }

  function measureFlip() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setFlipped(rect.bottom + PANEL_MAX_HEIGHT > window.innerHeight && rect.top > PANEL_MAX_HEIGHT)
  }

  function openWith(initialIndex: number) {
    if (disabled) return
    measureFlip()
    // Dismiss mobile keyboard if a different input was focused before tap
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== triggerRef.current) {
      active.blur()
    }
    setOpen(true)
    setQuery('')
    setHighlightedIndex(initialIndex)
  }

  function close(restoreFocus: boolean) {
    setOpen(false)
    setQuery('')
    setHighlightedIndex(-1)
    if (restoreFocus) triggerRef.current?.focus()
    onBlur?.()
  }

  function selectAt(index: number) {
    if (index < 0 || index >= filtered.length) return
    const opt = filtered[index]
    if (opt.disabled) return
    onChange(opt.value)
    close(true)
  }

  function findCurrentIndexInFiltered(): number {
    return filtered.findIndex((o) => o.value === value && !o.disabled)
  }

  // Outside-click closer
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
      setQuery('')
      setHighlightedIndex(-1)
      onBlur?.()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onBlur])

  // Recompute flip on resize while open
  useEffect(() => {
    if (!open) return
    function handleResize() { measureFlip() }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open])

  // Focus search on open if searchable
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  // Keep highlight in valid range when filtered changes
  useEffect(() => {
    if (!open) return
    setHighlightedIndex((prev) => {
      if (prev < 0) return getFirstEnabled()
      if (prev >= filtered.length || filtered[prev]?.disabled) return getFirstEnabled()
      return prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, open])

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || highlightedIndex < 0) return
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, open])

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (!open) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const initial = findCurrentIndexInFiltered()
        openWith(initial >= 0 ? initial : getFirstEnabled(options))
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(getNextEnabled(highlightedIndex, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(getNextEnabled(highlightedIndex, -1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlightedIndex(getFirstEnabled())
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlightedIndex(getLastEnabled())
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectAt(highlightedIndex)
    } else if (e.key === 'Tab') {
      // Close without selecting, let Tab proceed naturally
      setOpen(false)
      setQuery('')
      setHighlightedIndex(-1)
      onBlur?.()
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(getNextEnabled(highlightedIndex, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(getNextEnabled(highlightedIndex, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectAt(highlightedIndex)
    } else if (e.key === 'Tab') {
      setOpen(false)
      setQuery('')
      setHighlightedIndex(-1)
      onBlur?.()
    }
    // Letter keys fall through to normal text input behavior
  }

  const activeOptionId = open && highlightedIndex >= 0 && highlightedIndex < filtered.length
    ? `${listboxId}-opt-${filtered[highlightedIndex].value}`
    : undefined

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={error || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => {
          if (open) {
            close(false)
          } else {
            const initial = findCurrentIndexInFiltered()
            openWith(initial >= 0 ? initial : getFirstEnabled(options))
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={className}
        style={{
          width: '100%',
          textAlign: 'left',
          paddingRight: '36px',
          color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
          borderColor: error ? 'var(--color-danger)' : undefined,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          position: 'relative',
        }}
      >
        {selected ? selected.label : placeholder}
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: 'transform 150ms ease-out',
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
          }}
        >
          <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          ref={panelRef}
          role="listbox"
          id={listboxId}
          aria-activedescendant={activeOptionId}
          style={{
            position: 'absolute',
            ...(flipped ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
            left: 0,
            right: 0,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
            zIndex: 100,
            maxHeight: `${PANEL_MAX_HEIGHT}px`,
            overflowY: 'auto',
            padding: '4px',
            animation: 'menuapp-select-pop 150ms ease-out',
            fontFamily: 'var(--font-body)',
          }}
        >
          {searchable && (
            <div style={{
              position: 'sticky',
              top: 0,
              background: 'var(--bg-secondary)',
              paddingBottom: '4px',
              zIndex: 1,
            }}>
              <input
                ref={searchRef}
                role="searchbox"
                aria-label="Buscar opciones"
                aria-controls={listboxId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar..."
                className="input"
                style={{ padding: '8px 10px', fontSize: '13px' }}
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <div style={{
              padding: '10px 12px',
              fontSize: '13px',
              color: 'var(--text-tertiary)',
            }}>
              Sin resultados
            </div>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt.value === value
              const isHighlighted = i === highlightedIndex
              const optionId = `${listboxId}-opt-${opt.value}`
              return (
                <div
                  key={opt.value}
                  ref={(el) => { optionRefs.current[i] = el }}
                  role="option"
                  id={optionId}
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => { if (!opt.disabled) setHighlightedIndex(i) }}
                  onMouseDown={(e) => {
                    // mousedown + preventDefault keeps focus on trigger/search
                    e.preventDefault()
                    if (!opt.disabled) selectAt(i)
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    cursor: opt.disabled ? 'default' : 'pointer',
                    background: isHighlighted ? 'var(--bg-tertiary)' : 'transparent',
                    color: isSelected ? 'var(--color-accent)' : 'var(--text-primary)',
                    fontWeight: isSelected ? 500 : 400,
                    opacity: opt.disabled ? 0.4 : 1,
                  }}
                >
                  {opt.label}
                </div>
              )
            })
          )}
        </div>
      )}
      <style>{`@keyframes menuapp-select-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
