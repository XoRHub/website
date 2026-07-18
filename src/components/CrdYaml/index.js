/**
 * CrdYaml — renders a CRD reference as one annotated YAML manifest.
 *
 * Input is the JSON tree emitted by scripts/generate-crd-docs.mjs
 * (docs/reference/crds/_data/<kind>.json). Every field is a YAML key
 * with its API-type description as `#` comments above it; nested
 * objects are real <details> folds so the big passthrough subtrees
 * (workload, overrides, …) collapse out of the way.
 *
 * Node kinds: 'leaf' (key: <type>), 'node' (key: + children, foldable
 * when node.fold), 'item' (the `-` line of an array-of-objects
 * element). See the generator for how schemas map onto these.
 */
import React, {useRef} from 'react';
import './styles.css';

function CommentLines({text, depth}) {
  // Paragraph breaks in the Go doc comments are kept; single newlines
  // are re-wrapped by CSS (pre-wrap + hanging indent).
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p, i) => (
      <div key={i} className="crdy-line crdy-comment" style={{'--d': depth}}>
        {'# ' + p.replace(/\s*\n\s*/g, ' ').trim()}
      </div>
    ));
}

function KeyLine({node, depth, as: Tag = 'div', hint}) {
  return (
    <Tag className={`crdy-line${Tag === 'summary' ? ' crdy-summary' : ''}`} style={{'--d': depth}}>
      {node.dash && '- '}
      {node.key != null && (
        <>
          <span className={node.synthetic ? 'crdy-key crdy-synth' : 'crdy-key'}>{node.key}</span>
          {':'}
        </>
      )}
      {node.value != null && (
        <>
          {' '}
          <span className={node.literal ? 'crdy-lit' : 'crdy-val'}>{node.value}</span>
        </>
      )}
      {node.facts && <span className="crdy-facts">{'  # ' + node.facts}</span>}
      {hint && <span className="crdy-more"> {hint}</span>}
    </Tag>
  );
}

function Node({node, depth, openDepth}) {
  const comment = node.comment ? <CommentLines text={node.comment} depth={depth} /> : null;

  if (node.kind === 'leaf') {
    return (
      <>
        {comment}
        <KeyLine node={node} depth={depth} />
      </>
    );
  }

  if (node.kind === 'item') {
    return (
      <>
        <div className="crdy-line" style={{'--d': depth}}>
          -
        </div>
        {node.children.map((c, i) => (
          <Node key={i} node={c} depth={depth + 1} openDepth={openDepth} />
        ))}
      </>
    );
  }

  const children = node.children.map((c, i) => (
    <Node key={i} node={c} depth={depth + 1} openDepth={openDepth} />
  ));

  if (!node.fold) {
    return (
      <>
        {comment}
        <KeyLine node={node} depth={depth} />
        {children}
      </>
    );
  }

  return (
    <>
      {comment}
      <details className="crdy-details" open={depth < openDepth}>
        <KeyLine node={node} depth={depth} as="summary" hint={node.hint} />
        {children}
      </details>
    </>
  );
}

export default function CrdYaml({tree, header, openDepth = 2}) {
  const ref = useRef(null);
  const setAll = (open) => {
    for (const d of ref.current.querySelectorAll('details')) d.open = open;
  };
  return (
    <div className="crdy" ref={ref}>
      <div className="crdy-toolbar">
        <button type="button" onClick={() => setAll(true)}>
          Expand all
        </button>
        <button type="button" onClick={() => setAll(false)}>
          Collapse all
        </button>
      </div>
      <pre className="crdy-pre">
        {header && (
          <>
            <div className="crdy-line">
              <span className="crdy-key">apiVersion</span>:{' '}
              <span className="crdy-lit">{header.apiVersion}</span>
            </div>
            <div className="crdy-line">
              <span className="crdy-key">kind</span>: <span className="crdy-lit">{header.kind}</span>
            </div>
            <div className="crdy-line">
              <span className="crdy-key">metadata</span>:
            </div>
            <div className="crdy-line" style={{'--d': 1}}>
              <span className="crdy-key">name</span>: <span className="crdy-val">&lt;name&gt;</span>
            </div>
            <div className="crdy-line" style={{'--d': 1}}>
              <span className="crdy-key">namespace</span>:{' '}
              <span className="crdy-val">&lt;namespace&gt;</span>
            </div>
          </>
        )}
        <Node node={tree} depth={0} openDepth={openDepth} />
      </pre>
    </div>
  );
}
