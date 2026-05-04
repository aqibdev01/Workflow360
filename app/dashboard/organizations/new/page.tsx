"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Building2,
  Users,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Loader2,
  Search,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { createOrganization, addOrganizationMember, searchUsersByEmail, getOrCreateUserProfile } from "@/lib/database";
import { generateInviteCode } from "@/lib/utils";

// Validation schemas for each step
const step1Schema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  description: z.string().optional(),
});

const memberSchema = z.object({
  user_id: z.string().min(1, "Please select a valid user"),
  email: z.string().email("Please enter a valid email address"),
  full_name: z.string().optional(),
});

const step2Schema = z.object({
  members: z.array(memberSchema).optional(),
});

const completeSchema = step1Schema.merge(step2Schema);

type FormData = z.infer<typeof completeSchema>;

interface SearchResult {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

const STEPS = [
  { number: 1, title: "Basic Info", description: "Organization details" },
  { number: 2, title: "Invite Team", description: "Add team members" },
  { number: 3, title: "Review", description: "Confirm and create" },
];

export default function NewOrganizationPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
    trigger,
  } = useForm<FormData>({
    resolver: zodResolver(currentStep === 1 ? step1Schema : completeSchema),
    defaultValues: {
      name: "",
      description: "",
      members: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "members",
  });

  const formData = watch();

  // Debounced search function
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 3) {
        setIsSearching(true);
        const results = await searchUsersByEmail(searchQuery);
        // Filter out current user and already added members
        const filteredResults = results.filter(
          (result: SearchResult) =>
            result.id !== user?.id &&
            !formData.members?.some((m) => m.user_id === result.id)
        );
        setSearchResults(filteredResults);
        setIsSearching(false);
        setShowResults(true);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, user?.id, formData.members]);

  const handleSelectUser = (selectedUser: SearchResult) => {
    append({
      user_id: selectedUser.id,
      email: selectedUser.email,
      full_name: selectedUser.full_name || undefined,
    });
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    toast.success(`${selectedUser.full_name || selectedUser.email} added to team`);
  };

  const handleNext = async () => {
    let isValid = false;

    if (currentStep === 1) {
      isValid = await trigger(["name", "description"]);
    } else if (currentStep === 2) {
      isValid = await trigger(["members"]);
      // Generate invite code when moving to review step
      if (isValid || currentStep === 2) {
        setInviteCode(generateInviteCode());
      }
    }

    if (isValid || currentStep === 2) {
      // Step 2 validation is optional
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = async (data: FormData) => {
    if (currentStep < 3) {
      handleNext();
      return;
    }

    if (!user) {
      console.error("No user found in auth context");
      toast.error("Authentication required", {
        description: "You must be logged in to create an organization.",
      });
      return;
    }

    console.log("Creating organization with user:", user.id);

    setIsCreating(true);

    try {
      // Ensure public.users row exists — signup profile creation is fire-and-forget
      // and may not have completed before reaching this point
      await getOrCreateUserProfile(
        user.id,
        user.email!,
        (user as any).user_metadata?.full_name
      );

      // Create organization with the generated invite code
      const newOrg = await createOrganization({
        name: data.name,
        description: data.description || null,
        owner_id: user.id,
        invite_code: inviteCode,
      });

      console.log("Organization created:", newOrg);

      // Add creator as owner/admin
      await addOrganizationMember({
        org_id: newOrg.id,
        user_id: user.id,
        role: "admin",
      });

      // Add invited members (if any) - all as regular members
      if (data.members && data.members.length > 0) {
        for (const member of data.members) {
          try {
            await addOrganizationMember({
              org_id: newOrg.id,
              user_id: member.user_id,
              role: "member",
            });
          } catch (memberError) {
            console.error("Error adding member:", member.email, memberError);
          }
        }
        toast.success(`${data.members.length} team member(s) added to organization`);
      }

      toast.success("Organization created!", {
        description: `${data.name} has been created successfully.`,
      });

      // Redirect to organization dashboard
      setTimeout(() => {
        router.push(`/dashboard/organizations/${newOrg.id}`);
        router.refresh();
      }, 1000);
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error("Failed to create organization", {
        description: error.message || "An unexpected error occurred. Please try again.",
      });
      setIsCreating(false);
    }
  };

  // Show loading state while auth is initializing
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    router.push('/auth/login');
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Organization</h1>
        <p className="text-muted-foreground mt-2">
          Set up your team workspace and start collaborating
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center h-10 w-10 rounded-full border-2 transition-colors ${
                  currentStep >= step.number
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {currentStep > step.number ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span className="font-semibold">{step.number}</span>
                )}
              </div>
              <div className="hidden sm:block">
                <p
                  className={`text-sm font-medium ${
                    currentStep >= step.number ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <Separator
                className={`flex-1 mx-4 ${
                  currentStep > step.number ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {currentStep === 1 && <Building2 className="h-5 w-5" />}
              {currentStep === 2 && <Users className="h-5 w-5" />}
              {currentStep === 3 && <CheckCircle2 className="h-5 w-5" />}
              {STEPS[currentStep - 1].title}
            </CardTitle>
            <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Basic Info */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Organization Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="Acme Corp"
                    {...register("name")}
                    disabled={isCreating}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <textarea
                    id="description"
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Tell us about your organization..."
                    {...register("description")}
                    disabled={isCreating}
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive">{errors.description.message}</p>
                  )}
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-2">What happens next?</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      You'll be assigned as the organization owner
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      You can create unlimited projects
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      Invite team members using an invite code
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Step 2: Invite Team Members */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Search and add team members who are already registered in Workflow360.
                  You can also skip this step and share the invite code later.
                </p>

                {/* User Search Input */}
                <div className="space-y-2">
                  <Label htmlFor="search">Search Users by Email</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      type="email"
                      placeholder="Type email to search (min 3 characters)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      disabled={isCreating}
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  {showResults && (
                    <div className="border rounded-lg shadow-lg bg-background max-h-60 overflow-y-auto">
                      {searchResults.length > 0 ? (
                        searchResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => handleSelectUser(result)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-accent text-left transition-colors"
                          >
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                              {result.full_name
                                ? result.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
                                : result.email[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {result.full_name || "No name set"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {result.email}
                              </p>
                            </div>
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No users found with this email.</p>
                          <p className="text-xs mt-1">Only registered users can be added.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Added Members List */}
                {fields.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No team members yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Search by email above to add registered users, or skip this step
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Team Members ({fields.length})</Label>
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="flex items-center gap-3 p-4 border rounded-lg bg-accent/30"
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
                          {field.full_name
                            ? field.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
                            : field.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {field.full_name || "No name set"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {field.email}
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={isCreating}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Review */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      Organization Name
                    </h3>
                    <p className="text-lg font-semibold">{formData.name}</p>
                  </div>

                  {formData.description && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        Description
                      </h3>
                      <p className="text-sm">{formData.description}</p>
                    </div>
                  )}

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      Invite Code
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-2xl font-bold tracking-wider bg-primary/10 px-4 py-2 rounded-lg border-2 border-primary/20">
                        {inviteCode}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Share this code with team members to join your organization
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      Team Members
                    </h3>
                    {formData.members && formData.members.length > 0 ? (
                      <div className="space-y-2">
                        {formData.members.map((member, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                {member.full_name
                                  ? member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
                                  : member.email[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{member.full_name || member.email}</p>
                                {member.full_name && (
                                  <p className="text-xs text-muted-foreground">{member.email}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No team members added yet. You can invite them later using the invite code.
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                        Ready to create
                      </h4>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Click the button below to create your organization. Team members will be added automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 1 ? () => router.back() : handleBack}
            disabled={isCreating}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>

          {currentStep < 3 ? (
            <Button type="button" onClick={handleNext} disabled={isCreating}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Organization
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
