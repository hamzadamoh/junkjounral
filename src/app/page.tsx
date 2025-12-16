'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, BookOpen, Download } from 'lucide-react';
import { BiomorphicShape } from '@/components/BiomorphicShape';
import { SynestheticButton } from '@/components/SynestheticButton';
import { OrganicNav } from '@/components/OrganicNav';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gothic-gold/20 bg-gothic-charcoal/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-display font-bold text-gothic-gold">
              Gothic Junk Journal Generator
            </h1>
            <OrganicNav />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-5xl font-display font-bold text-gothic-gold mb-4">
            Create Stunning Gothic Journal Pages
          </h2>
          <p className="text-xl text-gothic-parchment/80 max-w-2xl mx-auto mb-8">
            Generate cohesive, stylized junk journal page collections in gothic, vintage, and dark aesthetics.
            Perfect for Etsy sellers creating digital printable ephemera packs.
          </p>
          <Link href="/generate">
            <SynestheticButton className="gothic-button gothic-button-primary text-lg px-8 py-4 biomorphic-glow">
              <Sparkles className="inline-block mr-2" size={20} />
              Start Generating
            </SynestheticButton>
          </Link>
        </motion.div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="spatial-depth"
          >
            <BiomorphicShape className="gothic-card text-center h-full">
              <BookOpen className="mx-auto mb-4 text-gothic-gold" size={48} />
              <h3 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                8 Unique Themes
              </h3>
              <p className="text-gothic-parchment/80">
                From Gothic Victorian to Steampunk Vintage, choose from carefully crafted themes
              </p>
            </BiomorphicShape>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="spatial-depth"
          >
            <BiomorphicShape className="gothic-card text-center h-full">
              <Sparkles className="mx-auto mb-4 text-gothic-gold" size={48} />
              <h3 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                AI-Powered Generation
              </h3>
              <p className="text-gothic-parchment/80">
                Powered by Midjourney for high-quality, print-ready journal pages
              </p>
            </BiomorphicShape>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="spatial-depth"
          >
            <BiomorphicShape className="gothic-card text-center h-full">
              <Download className="mx-auto mb-4 text-gothic-gold" size={48} />
              <h3 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                Multiple Export Formats
              </h3>
              <p className="text-gothic-parchment/80">
                Download as PNG, JPEG, or PDF bundle at 300 DPI print quality
              </p>
            </BiomorphicShape>
          </motion.div>
        </div>

        {/* Quick Start */}
        <div className="mt-16 text-center">
          <Link href="/themes">
            <button className="gothic-button px-8 py-3">
              Browse Themes
            </button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gothic-gold/20 mt-auto py-8">
        <div className="container mx-auto px-4 text-center text-gothic-parchment/60">
          <p>Gothic Junk Journal Page Generator © 2024</p>
        </div>
      </footer>
    </div>
  );
}

