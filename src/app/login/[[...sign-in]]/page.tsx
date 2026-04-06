import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mb-4">
            <span className="text-3xl font-bold text-blue-600">Good</span>
            <span className="text-3xl font-bold text-yellow-500">Guys</span>
          </div>
          <p className="text-gray-500">Sign in to your GoodGuys dashboard</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'shadow-none',
            },
          }}
        />
      </div>
    </div>
  );
}
