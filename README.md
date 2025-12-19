# Hashcat GUI – M1jsXploit

### Graphical Hashcat & John the Ripper Interface

A lightweight **GUI wrapper for Hashcat and John the Ripper**, designed to simplify password cracking workflows during security labs and penetration testing exercises.

This tool focuses on **ease of use**, **clear output**, and **automation of common cracking tasks**, while still giving full control over Hashcat and John parameters.

No API keys, no cloud services — everything runs locally.

---

## Features

- GUI-based execution of **Hashcat**
- Integrated **John the Ripper**
- Automatic hash extraction using:
  - `pdf2john`
  - `office2john`
  - `zip2john`
  - `rar2john`
  - `gpg2john`
- Supports common file types:
  - PDF
  - ZIP
  - RAR
  - Office documents (DOCX, XLSX, PPTX)
  - GPG encrypted files
- Wordlist-based cracking
- Automatic detection of hash formats
- Live output streaming in the GUI
- Start / Stop functionality
- Clean and readable console-style output
- Built for **educational and lab environments**

---

## Requirements

- **Operating System**
  - Windows (primary target)
  - Linux (experimental)

- **Installed Tools**
  - Hashcat
  - John the Ripper (Jumbo recommended)
  - Git Bash (Windows)

- **Runtime**
  - Node.js (LTS recommended)

---

## Installation

```bash
git clone https://github.com/MijsBjornPXL/Hashcat_GUI_M1jsXploit.git
cd Hashcat_GUI_M1jsXploit
npm install
npm start
```

---

## Disclaimer

This tool is intended **for educational use only**.

---

## License

MIT License
