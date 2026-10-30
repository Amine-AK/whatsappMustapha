"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Saved by the inline script in layout.tsx: the browser can fire it before React loads. */
    __installPrompt?: InstallPromptEvent | null;
  }
}

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * "📲 ثبت التطبيق": opens the browser's install prompt (Chrome / Edge / Samsung
 * Internet). Where there is none (iPhone Safari, or the prompt isn't ready yet)
 * on a phone, it explains how to add the app to the home screen by hand.
 * Hidden once the app runs installed.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    const sync = () => {
      setPrompt(window.__installPrompt ?? null);
      setShow(Boolean(window.__installPrompt) || phone);
    };
    const installed = () => {
      window.__installPrompt = null;
      setShow(false);
    };
    sync();
    window.addEventListener("installprompt-ready", sync);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("installprompt-ready", sync);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!show) return null;

  async function install() {
    if (!prompt) {
      setHelp(true);
      return;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt can only be used once.
    window.__installPrompt = null;
    setPrompt(null);
    if (outcome === "accepted") setShow(false);
  }

  return (
    <>
      <button type="button" className="btn install-btn" onClick={() => void install()} aria-label="ثبت التطبيق">
        📲 ثبت<span className="on-wide-text"> التطبيق</span>
      </button>
      {help && (
        <Modal
          title="ثبت التطبيق فالتيليفون"
          onClose={() => setHelp(false)}
          footer={
            <button type="button" className="btn primary" onClick={() => setHelp(false)}>
              فهمت
            </button>
          }
        >
          {ios ? (
            <ol className="steps">
              <li>حل التطبيق فـ <strong>Safari</strong>.</li>
              <li>
                ضغط على زر المشاركة <strong>⬆️</strong> لتحت.
              </li>
              <li>
                اختار <strong>«إضافة إلى الشاشة الرئيسية»</strong> (Add to Home Screen).
              </li>
              <li>ضغط «إضافة». غادي تلقا الأيقونة ديال «الكريدي» مع التطبيقات.</li>
            </ol>
          ) : (
            <ol className="steps">
              <li>حل التطبيق فـ <strong>Chrome</strong>.</li>
              <li>
                ضغط على <strong>⋮</strong> لفوق.
              </li>
              <li>
                اختار <strong>«تثبيت التطبيق»</strong> (Install app) ولا <strong>«إضافة إلى الشاشة الرئيسية»</strong>.
              </li>
              <li>إلا ما لقيتيهاش، يمكن التطبيق مثبت ديجا: قلب على أيقونة «الكريدي» مع التطبيقات.</li>
            </ol>
          )}
        </Modal>
      )}
    </>
  );
}
