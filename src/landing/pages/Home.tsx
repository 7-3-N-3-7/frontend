import { Link } from '@tanstack/react-router'
import { Button } from "@/components/ui/button"
import { BookOpen, PenTool, Lock, Brain } from "lucide-react"

export function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <header className="px-6 py-4 flex items-center justify-between bg-white border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-600" />
          <span className="text-xl font-bold tracking-tight text-slate-900">EduJournal</span>
        </div>
        <Link to="/login">
          <Button>Register / Login</Button>
        </Link>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-blue-100 text-blue-800 mb-6">
          For Educational Purposes
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 max-w-3xl">
          Reflect, Learn, and Grow with <span className="text-blue-600">EduJournal</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-10">
          A dedicated platform for secure journal tracking and seamless appointment booking designed specifically for therapists and their clients.
        </p>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-5xl w-full text-left">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
              <PenTool className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Daily Entries</h3>
            <p className="text-slate-600">Write down your daily learnings and reflections with an intuitive, distraction-free editor.</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Private & Secure</h3>
            <p className="text-slate-600">Your journals are encrypted and private, ensuring a safe space for personal educational reflection.</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
              <Brain className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Cognitive Growth</h3>
            <p className="text-slate-600">Look back at past entries to see how your understanding has evolved over time.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-slate-500 text-sm bg-white border-t mt-auto">
        &copy; {new Date().getFullYear()} EduJournal. This is an educational project.
      </footer>
    </div>
  )
}