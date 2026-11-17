import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import { useEffect } from 'react'
import '@/index.css'
import { SiteFooter } from '@/components/site-footer'
import { SiteNav } from '@/components/site-nav'
import { ClaimPage } from '@/pages/claim-page'
import { CoinPage } from '@/pages/coin-page'
import { CoinsPage } from '@/pages/coins-page'
import { HomePage } from '@/pages/home-page'
import { MethodPage } from '@/pages/method-page'
import { StatsPage } from '@/pages/stats-page'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Pages not built yet (token, api).
function Later() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-16 md:px-6">
      <div className="label">Not built yet</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page comes in the next step.</h1>
      <Link to="/" className="mt-6 inline-block text-accent">Back home</Link>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollTop />
      <SiteNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/coins" element={<CoinsPage />} />
        <Route path="/coin/:chain/:ca" element={<CoinPage />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/method" element={<MethodPage />} />
        <Route path="*" element={<Later />} />
      </Routes>
      <SiteFooter />
    </BrowserRouter>
  </StrictMode>,
)
