'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    homeAddress: '',
    phoneNumber: '',
    ssn: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => setStep(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Send data to Next.js API Route, which orchestrates Keycloak + Spring Boot
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        // Redirect to dashboard (platform.127.0.0.1.nip.io)
        window.location.href = window.location.protocol + '//platform.' + window.location.host;
      } else {
        alert('Registration failed. Please try again.');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card shadow p-4">
            <h2 className="text-center mb-4">Therapist Registration</h2>
            
            <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
              {step === 1 && (
                <>
                  <h5 className="mb-3">Step 1: Account Credentials (Keycloak)</h5>
                  <div className="mb-3">
                    <label className="form-label">Email</label>
                    <input type="email" name="email" className="form-control" required value={formData.email} onChange={handleChange} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Username</label>
                    <input type="text" name="username" className="form-control" required value={formData.username} onChange={handleChange} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Password</label>
                    <input type="password" name="password" className="form-control" required value={formData.password} onChange={handleChange} />
                  </div>
                  <button type="submit" className="btn btn-primary w-100">Next Step &rarr;</button>
                </>
              )}

              {step === 2 && (
                <>
                  <h5 className="mb-3">Step 2: Professional Profile</h5>
                  <div className="mb-3">
                    <label className="form-label">Home Address</label>
                    <input type="text" name="homeAddress" className="form-control" required value={formData.homeAddress} onChange={handleChange} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Phone Number</label>
                    <input type="tel" name="phoneNumber" className="form-control" required value={formData.phoneNumber} onChange={handleChange} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Social Security Number (SSN)</label>
                    <input type="text" name="ssn" className="form-control" required value={formData.ssn} onChange={handleChange} />
                  </div>
                  
                  <div className="d-flex justify-content-between">
                    <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>&larr; Back</button>
                    <button type="submit" className="btn btn-success" disabled={loading}>
                      {loading ? 'Creating Account...' : 'Complete Registration'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

