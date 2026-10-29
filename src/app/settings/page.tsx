"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { useThemeContext, DEFAULT_THEME, AVAILABLE_CLUBS, ClubTheme } from "@/context/ThemeContext";
import { isColorContrastAccessible } from "@/lib/tenancy";
import {
  Building2,
  Palette,
  Users,
  Shield,
  Save,
  RotateCcw,
  Upload,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { SuccessBanner } from "@/components/ui/StatusStates";

export default function SettingsPage() {
  const { currentClub, setClub, userRole } = useThemeContext();
  const [clubName, setClubName] = useState(currentClub.name);
  const [shortName, setShortName] = useState(currentClub.shortName);
  const [timezone, setTimezone] = useState("Europe/London");
  const [primaryColor, setPrimaryColor] = useState(currentClub.primaryColor);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [contrastWarning, setContrastWarning] = useState(false);

  const isClubAdmin = userRole === "chief_scout" || userRole === "platform_admin";

  const handleColorChange = (newColor: string) => {
    setPrimaryColor(newColor);
    const accessible = isColorContrastAccessible(newColor);
    setContrastWarning(!accessible);
  };

  const handleSave = () => {
    const updatedTheme: ClubTheme = {
      ...currentClub,
      name: clubName,
      shortName: shortName,
      primaryColor: primaryColor,
    };
    setClub(updatedTheme);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  const handleResetToDefault = () => {
    setClub(DEFAULT_THEME);
    setClubName(DEFAULT_THEME.name);
    setShortName(DEFAULT_THEME.shortName);
    setPrimaryColor(DEFAULT_THEME.primaryColor);
    setContrastWarning(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Entitlements Badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">Club Workspace & Branding</h1>
            <Badge variant="default" size="sm">Enterprise Plan</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure tenant branding, colors, members, and isolation policies for <strong className="text-white">{currentClub.name}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefault}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset to HerScout Default
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isClubAdmin}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {savedSuccess && (
        <SuccessBanner
          message="Workspace branding and configuration saved successfully."
          onDismiss={() => setSavedSuccess(false)}
        />
      )}

      {contrastWarning && (
        <div className="p-3 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Accessibility Warning:</strong> The selected primary color has lower contrast against the dark background. A lightness of 40% or higher is recommended for WCAG AA compliance.
          </span>
        </div>
      )}

      {/* Club Identity & Crest */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <CardTitle>Club Identity & Crest</CardTitle>
          </div>
          <CardDescription>
            Official naming and crest displayed on private reports and scout exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Official Club Name
                </label>
                <Input
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  disabled={!isClubAdmin}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Display Code / Short Name
                  </label>
                  <Input
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    disabled={!isClubAdmin}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Preferred Timezone
                  </label>
                  <Select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={!isClubAdmin}
                  >
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Madrid">Europe/Madrid (CET/CEST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Logo Upload Box */}
            <div className="flex flex-col items-center justify-center border border-dashed border-border/80 rounded-lg p-4 bg-navy-950/40 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg mb-2 border"
                style={{
                  backgroundColor: `hsl(${primaryColor} / 0.15)`,
                  borderColor: `hsl(${primaryColor} / 0.4)`,
                  color: `hsl(${primaryColor})`,
                }}
              >
                {shortName.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-white">Club Crest / Badge</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">PNG, WEBP up to 2MB</p>
              <Button variant="outline" size="xs" className="mt-2" leftIcon={<Upload className="w-3 h-3" />}>
                Upload Logo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Palette & Theme Customization */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <CardTitle>Branding & Color Theme</CardTitle>
          </div>
          <CardDescription>
            Configure your club&apos;s custom palette without affecting other tenants on HerScout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-2">
              Club Presets (Multi-Tenant Palette Simulator)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {AVAILABLE_CLUBS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setClub(c);
                    setClubName(c.name);
                    setShortName(c.shortName);
                    handleColorChange(c.primaryColor);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                    currentClub.id === c.id
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-card/60 hover:border-white/20"
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full mb-2"
                    style={{ backgroundColor: `hsl(${c.primaryColor})` }}
                  />
                  <div className="text-xs font-semibold text-white truncate">{c.shortName}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{c.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border/40">
            <label className="text-xs font-medium text-foreground block mb-1">
              Custom Primary Accent (HSL String)
            </label>
            <div className="flex items-center gap-3">
              <Input
                value={primaryColor}
                onChange={(e) => handleColorChange(e.target.value)}
                placeholder="e.g. 217 91% 60%"
                className="max-w-xs font-mono text-xs"
                disabled={!isClubAdmin}
              />
              <div
                className="w-8 h-8 rounded-md border border-white/20 flex-shrink-0"
                style={{ backgroundColor: `hsl(${primaryColor})` }}
              />
              <span className="text-[11px] text-muted-foreground">
                Applied to badges, active nav indicators, and report accents.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Members & Seat Entitlements */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <CardTitle>Club Members & Seat Allocation</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              3 of 15 seats assigned
            </span>
          </div>
          <CardDescription>
            Multi-tenant permission assignment. Only assigned members can view private reports and watchlists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y divide-border/40">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Elena Rostova (You)</p>
                <p className="text-[11px] text-muted-foreground">elena.rostova@herscout.pro</p>
              </div>
              <Badge variant="default" size="sm">Chief Scout</Badge>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Marcus Vance</p>
                <p className="text-[11px] text-muted-foreground">marcus.v@herscout.pro</p>
              </div>
              <Badge variant="secondary" size="sm">Field Scout</Badge>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Sarah Al-Mansoor</p>
                <p className="text-[11px] text-muted-foreground">s.almansoor@herscout.pro</p>
              </div>
              <Badge variant="secondary" size="sm">Data Analyst</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
