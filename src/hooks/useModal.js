import { useState, useCallback } from 'react'
import { createElement } from 'react'
import AlertModal from '../components/AlertModal'
import ConfirmModal from '../components/ConfirmModal'

export default function useModal() {
    const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '', type: 'info' })
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, confirmText: 'Bestätigen', cancelText: 'Abbrechen', isDestructive: false })

    const showAlert = useCallback(({ title, message, type = 'info' }) => {
        setAlertState({ isOpen: true, title, message, type })
    }, [])

    const showConfirm = useCallback(({ title, message, onConfirm, confirmText = 'Bestätigen', cancelText = 'Abbrechen', isDestructive = false }) => {
        setConfirmState({ isOpen: true, title, message, onConfirm, confirmText, cancelText, isDestructive })
    }, [])

    const closeAlert = useCallback(() => {
        setAlertState(prev => ({ ...prev, isOpen: false }))
    }, [])

    const closeConfirm = useCallback(() => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
    }, [])

    const modalElement = createElement(
        'div',
        null,
        createElement(AlertModal, {
            isOpen: alertState.isOpen,
            onClose: closeAlert,
            title: alertState.title,
            message: alertState.message,
            type: alertState.type
        }),
        createElement(ConfirmModal, {
            isOpen: confirmState.isOpen,
            onClose: closeConfirm,
            onConfirm: confirmState.onConfirm || (() => {}),
            title: confirmState.title,
            message: confirmState.message,
            confirmText: confirmState.confirmText,
            cancelText: confirmState.cancelText,
            isDestructive: confirmState.isDestructive
        })
    )

    return { showAlert, showConfirm, modalElement }
}
