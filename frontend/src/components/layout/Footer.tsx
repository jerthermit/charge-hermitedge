const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="mt-auto border-t border-white/10 bg-[#111510] text-white"
    >
      <div className="mx-auto flex min-h-14 max-w-[1680px] items-center justify-center px-5 py-4 text-center sm:justify-end sm:px-6 sm:text-right lg:px-8">
        <p className="text-xs text-white/50">
          © {currentYear} Emman Ermitaño. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
