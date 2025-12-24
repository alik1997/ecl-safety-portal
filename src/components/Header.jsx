import React from "react";
import logo from "../assets/logo.png";
import tiger from "../assets/hero.gif";

export default function Header() {
  return (
    <header className="w-full flex flex-col items-center py-4 text-center">
      
      {/* Logo + Tiger in One Row */}
      <div className="flex items-center gap-3 mb-3">
        <img
          src={logo}
          alt="ECL Logo"
          className="h-20 md:h-24 object-contain"
        />

        {/* <img
          src={tiger}
          alt="Mascot Tiger"
          className="h-16 md:h-20 object-contain"
        /> */}
      </div>

      {/* Professional Bold Stylish Title */}
      <h1 className="text-lg md:text-2xl font-bold text-[#003366] tracking-wide uppercase leading-snug">
        Reporting of Observed Unsafe Act / Unsafe Practice / Near Miss Incident
      </h1>

      {/* Clean Accent Bar */}
      <div className="w-36 h-[4px] bg-[#003366] rounded-full mt-2"></div>
    </header>
  );
}
