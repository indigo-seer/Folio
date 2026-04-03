import { Component, type ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Folium Error Boundary caught:', error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-screen">
                    <div className="text-center max-w-md px-6">
                        <h2 className="font-serif text-h2 text-folium-text dark:text-folium-dark-text mb-4">
                            Something went wrong
                        </h2>
                        <p className="font-sans text-body text-folium-text-secondary dark:text-folium-dark-text-secondary mb-6">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="px-4 py-2 rounded-lg font-sans text-ui
                         bg-folium-accent text-white hover:bg-folium-accent-hover
                         dark:bg-folium-dark-accent dark:hover:bg-folium-dark-accent-hover
                         transition-colors duration-folium"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
