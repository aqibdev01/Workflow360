"use client";

import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  Users,
  BarChart3,
  Zap,
  Shield,
  RefreshCcw,
  CheckCircle2,
  ArrowRight,
  Brain,
  Target,
  TrendingUp,
  Clock,
  Layers,
  LayoutDashboard,
} from "lucide-react";

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  const featuresRef = useRef<HTMLElement>(null);
  const benefitsRef = useRef<HTMLElement>(null);
  const { user, loading } = useAuth();

  useEffect(() => {
    setIsVisible(true);

    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -100px 0px",
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-fade-in-up");
        }
      });
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions
    );

    [featuresRef, benefitsRef].forEach((ref) => {
      if (ref.current) {
        observer.observe(ref.current);
      }
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Logo className="h-9 w-9" />
              <span className="text-xl font-bold text-gray-900">
                Workflow<span className="text-blue-600">360</span>
              </span>
            </div>
            <div className="hidden md:flex space-x-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
                Features
              </a>
              <a href="#benefits" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
                Benefits
              </a>
            </div>
            <div className="flex items-center space-x-4">
              {!loading && user ? (
                <Link href="/dashboard">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Go to Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/auth/login">
                    <Button variant="ghost" size="sm" className="text-gray-600 hover:text-blue-600">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <div className={`text-center space-y-8 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-sm text-blue-700 font-medium">AI-Powered Project Management</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold leading-tight text-gray-900">
              Manage Projects
              <br />
              <span className="text-blue-600">360 Degrees</span>
            </h1>

            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              The unified platform for small teams. Simple, powerful, and built for the way you work.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://drive.google.com/file/d/1afLfKQcj71f7OK8uJKxzskzB4ZChtZRt/view?usp=sharing" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
                  Watch Demo
                </Button>
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 pt-16 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">98%</div>
                <div className="text-sm text-gray-500 mt-1">Satisfaction</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-violet-600">50K+</div>
                <div className="text-sm text-gray-500 mt-1">Projects</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">2.5x</div>
                <div className="text-sm text-gray-500 mt-1">Faster</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        ref={featuresRef}
        className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50"
      >
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed for modern teams
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "AI-Powered Insights",
                description: "Get intelligent suggestions for better project planning"
              },
              {
                icon: Users,
                title: "Team Collaboration",
                description: "Real-time collaboration with your team, anywhere"
              },
              {
                icon: BarChart3,
                title: "Advanced Analytics",
                description: "Track progress with beautiful dashboards"
              },
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Optimized performance for quick teams"
              },
              {
                icon: Shield,
                title: "Enterprise Security",
                description: "Bank-level encryption keeps data safe"
              },
              {
                icon: RefreshCcw,
                title: "Agile Workflows",
                description: "Sprint planning and Kanban boards"
              },
            ].map((feature, index) => (
              <Card key={index} className="bg-white border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 p-6 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section
        id="benefits"
        ref={benefitsRef}
        className="py-20 px-4 sm:px-6 lg:px-8"
      >
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900">
              Built for <span className="text-violet-600">Small Teams</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Perfect for teams of 5-20 people
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Target,
                title: "Perfect for Your Size",
                description: "Just right for teams of 5-20 people. Not too complex, not too simple."
              },
              {
                icon: TrendingUp,
                title: "Grow Without Limits",
                description: "Scale seamlessly as your team expands. No need to switch tools."
              },
              {
                icon: Clock,
                title: "Save 10+ Hours Weekly",
                description: "Automate repetitive tasks and focus on what matters most."
              },
              {
                icon: Layers,
                title: "All-in-One Platform",
                description: "Replace 5+ tools with one unified workspace for everything."
              },
            ].map((benefit, index) => (
              <Card key={index} className="bg-white border-gray-100 hover:shadow-lg transition-all duration-300 p-8 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
                  <benefit.icon className="w-7 h-7 text-violet-600" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900">{benefit.title}</h3>
                <p className="text-gray-600 text-lg">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-blue-600">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            Start Your Free Trial
          </h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            30 days free. Then $29/month for unlimited projects and team members.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            {[
              "Unlimited projects",
              "Unlimited team members",
              "AI-powered insights",
              "Advanced analytics",
              "Priority support"
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-white">
                <CheckCircle2 className="h-5 w-5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {!loading && user ? (
            <Link href="/dashboard">
              <Button size="lg" className="bg-white hover:bg-gray-100 text-blue-600 px-12 mt-8">
                <LayoutDashboard className="mr-2 h-5 w-5" />
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/auth/signup">
              <Button size="lg" className="bg-white hover:bg-gray-100 text-blue-600 px-12 mt-8">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center">
              <Image
                src="/workflowlogo.jpeg"
                alt="Workflow360"
                width={0}
                height={0}
                sizes="180px"
                style={{ height: "38px", width: "auto" }}
              />
            </div>

            <div className="flex gap-8 text-sm text-gray-600">
              <a href="#" className="hover:text-blue-600 transition-colors">Privacy</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Terms</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Contact</a>
            </div>
          </div>
          <div className="border-t border-gray-100 mt-8 pt-8 text-center text-sm text-gray-500">
            <p>&copy; 2025 Workflow360. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
