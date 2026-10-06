export const metadata = {
  title: "NCI Digest — Research paper collections",
  description: "Convert cancer research publications into a podcast, TED-style talk, slide deck, or narrated video, then share them from your collection.",
  icons: {
    icon: 'https://s3.k8s.maayanlab.cloud/axiom-podcasts/favicon.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
