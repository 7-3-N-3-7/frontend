import Link from 'next/link';
import { cookies } from 'next/headers';

export default async function LandingPage() {
  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>EduJournal Platform</h2>
        <Link href="/auth/register" className="btn btn-primary">
          Login / Register
        </Link>
      </div>

      <div className="card shadow p-5 text-center">
        <h1 className="display-4">Welcome to EduJournal</h1>
        <p className="lead mt-4">
          The ultimate booking and journaling system exclusively designed for modern therapists.
        </p>
        <hr className="my-4" />
        <p>
          Manage your schedule, securely log patient journals, and streamline your practice all in one place.
        </p>
        <div className="mt-4">
          <Link href="/auth/register" className="btn btn-lg btn-success">
            Get Started Today
          </Link>
        </div>
      </div>
    </div>
  );
}
