const authors = [
  {
    label: 'Author',
    username: 'zijiebuzhuang',
  },
  {
    label: 'Co-author',
    username: 'panaged',
  },
]

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-section">
          <p>© {new Date().getFullYear()} AI Jobs Doomsday Clock. Open source research project.</p>
          <p className="footer-disclaimer">
            This is an independent project combining Andrej Karpathy's jobs dataset exposures with the Doomsday Clock methodology.
            Not affiliated with the Bulletin of the Atomic Scientists.
          </p>
        </div>

        <div className="footer-authors" aria-label="Project authors">
          {authors.map((author) => (
            <a
              key={author.username}
              className="footer-author"
              href={`https://github.com/${author.username}`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`https://github.com/${author.username}.png?size=80`}
                alt={`${author.username} GitHub avatar`}
                width={40}
                height={40}
                loading="lazy"
              />
              <span className="footer-author-meta">
                <span className="footer-author-label">{author.label}</span>
                <span className="footer-author-name">@{author.username}</span>
              </span>
            </a>
          ))}
        </div>

        <div className="footer-links">
          <a href="https://github.com/zijiebuzhuang/jobs-doomsday-clock" target="_blank" rel="noreferrer">
            Source Code <span aria-hidden="true" className="external-arrow">→</span>
          </a>
          <a href="https://karpathy.ai/jobs/" target="_blank" rel="noreferrer">
            Jobs Dataset <span aria-hidden="true" className="external-arrow">→</span>
          </a>
          <a href="https://thebulletin.org/doomsday-clock/" target="_blank" rel="noreferrer">
            Original Doomsday Clock <span aria-hidden="true" className="external-arrow">→</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
