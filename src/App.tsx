import { useState } from 'react';
import { 
  Home, 
  Calendar, 
  Briefcase, 
  GraduationCap, 
  BookOpen, 
  Users, 
  MessageSquare, 
  Library, 
  Wrench, 
  Bell, 
  Sun, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  FileText, 
  CheckSquare, 
  Activity, 
  UserCheck, 
  Settings, 
  LogOut, 
  LayoutGrid
} from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'week' | 'day' | 'month' | 'year'>('week');
  const selectedDate = '7. - 13. September 2026';

  const navItems = [
    { label: 'Overblik', icon: Home, active: true },
    { label: 'Booking', icon: Calendar },
    { label: 'Sagsbehandling', icon: Briefcase },
    { label: 'Uddannelse', icon: GraduationCap },
    { label: 'Fagbog', icon: BookOpen },
    { label: 'Kontakter', icon: Users },
    { label: 'Fællesskab', icon: MessageSquare },
    { label: 'Bibliotek', icon: Library },
    { label: 'Værktøjer', icon: Wrench },
  ];

  const actionCards = [
    { title: 'Outcome', icon: Activity, bg: 'bg-white' },
    { title: 'Opgaver', icon: CheckSquare, bg: 'bg-white' },
    { title: 'Ny journal', icon: FileText, bg: 'bg-white' },
    { title: 'Beskeder', icon: MessageSquare, bg: 'bg-white' },
    { title: 'Diagnostik', icon: Activity, bg: 'bg-white' },
    { title: 'Veterankoordinator', icon: UserCheck, bg: 'bg-white' },
  ];

  const days = [
    { name: 'Mandag 7.9', isToday: true },
    { name: 'Tirsdag 8.9', isToday: false },
    { name: 'Onsdag 9.9', isToday: false },
    { name: 'Torsdag 10.9', isToday: false },
    { name: 'Fredag 11.9', isToday: false },
    { name: 'Lørdag 12.9', isToday: false },
    { name: 'Søndag 13.9', isToday: false },
  ];

  const hours = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00'];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 z-10">
        <div>
          {/* Logo Header */}
          <div className="flex items-center gap-2 px-3 py-4 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold tracking-widest text-xs">
              INT
            </div>
            <span className="font-bold text-xl tracking-widest text-slate-900 uppercase">Integrate</span>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    item.active
                      ? 'bg-slate-100 text-slate-900 font-semibold shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between px-2">
            <div>
              <div className="font-semibold text-sm text-slate-900">Jesper Kock</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>ID: 042007</span>
              </div>
              <div className="text-xs text-slate-400">Klient</div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <Settings className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg">
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-slate-500">
            <button className="p-1.5 hover:bg-slate-100 rounded-lg"><Bell className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-slate-100 rounded-lg"><Sun className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-slate-100 rounded-lg"><Maximize2 className="w-4 h-4" /></button>
            <span className="text-xs font-medium text-slate-600 ml-2">Mandag 7. sep 2026 - 18.58</span>
          </div>
        </header>

        {/* Dashboard Body */}
        <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
          {/* Greeting Banner */}
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            GOD AFTEN, JESPER
          </div>

          {/* Action Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {actionCards.map((card, idx) => {
              const Icon = card.icon;
              return (
                <button
                  key={idx}
                  className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left"
                >
                  <div className="p-2 bg-slate-50 rounded-xl text-slate-700">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-slate-800 text-sm">{card.title}</span>
                </button>
              );
            })}
          </div>

          {/* Upcoming Appointments Banner */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Kommende aftaler (0)</span>
              </div>
              <span className="font-semibold text-slate-400 tracking-wider">NÆSTE 7 DAGE</span>
            </div>
            <div className="text-center py-6 text-sm text-slate-400">
              Ingen planlagte aftaler i de næste 7 dage
            </div>
          </div>

          {/* Calendar View Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Calendar Controls Toolbar */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
              {/* Date Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <button className="p-2 hover:bg-slate-50 text-slate-600 border-r border-slate-200">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 border-r border-slate-200">
                    I dag
                  </button>
                  <button className="p-2 hover:bg-slate-50 text-slate-600">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <span className="font-bold text-slate-800 text-base">{selectedDate}</span>
              </div>

              {/* View Toggle & Actions */}
              <div className="flex items-center gap-3">
                <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
                  <button
                    onClick={() => setCurrentView('day')}
                    className={`px-3 py-1 rounded-lg ${currentView === 'day' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500'}`}
                  >
                    Dag
                  </button>
                  <button
                    onClick={() => setCurrentView('week')}
                    className={`px-3 py-1 rounded-lg ${currentView === 'week' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500'}`}
                  >
                    Uge
                  </button>
                  <button
                    onClick={() => setCurrentView('month')}
                    className={`px-3 py-1 rounded-lg ${currentView === 'month' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500'}`}
                  >
                    Måned
                  </button>
                  <button
                    onClick={() => setCurrentView('year')}
                    className={`px-3 py-1 rounded-lg ${currentView === 'year' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500'}`}
                  >
                    År
                  </button>
                </div>

                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-medium hover:bg-slate-800 transition-colors shadow-sm">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ny note / opgave</span>
                </button>
              </div>
            </div>

            {/* Weekly Calendar Grid Header */}
            <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50/50 text-center text-xs font-medium text-slate-500">
              <div className="p-3 border-r border-slate-100 flex items-center justify-center gap-1 font-semibold text-slate-400">
                <span>DK</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded">U 37</span>
              </div>
              {days.map((day, idx) => (
                <div
                  key={idx}
                  className={`p-3 border-r border-slate-100 ${day.isToday ? 'bg-white text-slate-900 font-bold border-b-2 border-b-slate-900' : ''}`}
                >
                  {day.name}
                </div>
              ))}
            </div>

            {/* Time Slot Rows */}
            <div className="divide-y divide-slate-100">
              {hours.map((hour, hIdx) => (
                <div key={hIdx} className="grid grid-cols-8 min-h-[50px] text-xs">
                  <div className="p-2 border-r border-slate-100 text-slate-400 font-medium text-center bg-slate-50/30">
                    {hour}
                  </div>
                  {days.map((_, dIdx) => (
                    <div key={dIdx} className="border-r border-slate-100 hover:bg-slate-50/50 transition-colors"></div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
