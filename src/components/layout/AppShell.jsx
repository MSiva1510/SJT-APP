import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  return (
    <div className="flex h-full bg-slate-100 dark:bg-navy-950 bg-mesh">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
